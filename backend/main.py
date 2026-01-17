import requests
import time
from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Depends, status
from pydantic import BaseModel
from deep_translator import GoogleTranslator
import pickle
import pandas as pd
from typing import List, Optional, Dict, Any
import os
from dotenv import load_dotenv
import nltk
from nltk.corpus import stopwords
import string
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np
from youtube_search import YoutubeSearch
import concurrent.futures
import json
import base64
import socket
import random
from fastapi.middleware.cors import CORSMiddleware
from datetime import timedelta, datetime
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ExifTags
import io


from pathlib import Path

# Robustly load .env from the backend directory
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Database & Auth
from database import get_users_collection, get_recipe_collection
from auth import get_current_user, create_access_token, get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES, UserInDB

# Initialize FastAPI
app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---
class RecipeRequest(BaseModel):
    ingredients: str
    prep_time: int
    cook_time: int

class UserCreate(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    experience_level: Optional[str] = None
    dietary_preferences: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    health_goals: Optional[List[str]] = None

class InteractionRequest(BaseModel):
    action: str
    recipe_name: str
    details: Optional[Dict[str, Any]] = None

class Recipe(BaseModel):
    id: int
    name: str
    translated_name: str
    ingredients: str
    prep_time: int
    cook_time: int
    url: str
    youtube_link: str
    missing_ingredients: List[Dict[str, str]] = []
    match_score: Optional[int] = None # 0-100 percentage
    instructions: List[str] = []
    cuisine: Optional[str] = None
    course: Optional[str] = None
    diet: Optional[str] = None
    servings: Optional[int] = None

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class TranslationRequest(BaseModel):
    text: str
    target_lang: str

# --- Globals & Setup ---
model_data = None
tfidf_vectorizer = None
tfidf_matrix = None
df_english = None

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Ordered by preference
VISION_MODELS = [
    "google/gemma-3-27b-it:free",
    "qwen/qwen-2.5-vl-7b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "nvidia/llama-3.2-90b-vision-instruct:free",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
]

MODEL_PATH = r"recipe_recommender_model.pkl"

try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

def load_model():
    global model_data, tfidf_vectorizer, tfidf_matrix, df_english
    try:
        if os.path.exists(MODEL_PATH):
            with open(MODEL_PATH, 'rb') as f:
                model_data = pickle.load(f)
            
            # Unpack the model data
            tfidf_vectorizer = model_data['tfidf_vectorizer']
            tfidf_matrix = model_data['tfidf_matrix']
            
            # Load from MongoDB
            # Load from MongoDB - DISABLED per user request to use Pickle file
            # mongo_recipes = get_recipe_collection()
            # if mongo_recipes is not None:
            #     print("Loading recipes from MongoDB...")
            #     # Sort by Srno to match TF-IDF matrix alignment!
            #     cursor = mongo_recipes.find().sort("Srno", 1)
            #     recipes_list = list(cursor)
            #     if recipes_list:
            #         df_english = pd.DataFrame(recipes_list)
            #         print(f"Loaded {len(df_english)} recipes from MongoDB.")
            #     else:
            #          print("MongoDB collection text empty. Fallback to pickle dataframe.")
            #          df_english = model_data['dataframe']
            # else:
            #      print("MongoDB not connected. Fallback to pickle dataframe.")
            df_english = model_data['dataframe']
            
            print("Model loaded successfully.")
        else:
            print(f"Model file not found at {MODEL_PATH}")
    except Exception as e:
        print(f"Error loading model: {e}")

load_model()

try:
    import ollama
    print("Ollama module loaded. Using 'llama3' for text analysis.")
except ImportError:
    print("Error: Ollama module not found. Please install with `pip install ollama`.")

    print("Error: Ollama module not found. Please install with `pip install ollama`.")

# --- Helper Functions ---
COOKING_STOPWORDS = {
    "teaspoon", "tsp", "tablespoon", "tbsp", "cup", "gram", "gms", "g", "kg", "ml", "liter", "litre", "l", "lb", "oz", "pinch", "bunch", "sprig", "cloves",
    "chopped", "sliced", "diced", "minced", "grated", "crushed", "beaten", "whisked", "sifted", "melted", "slit", "halved", "quartered", "cubed",
    "peeled", "cored", "seeded", "washed", "cleaned", "dried", "roasted", "toasted", "fried", "boiled", "warm", "cold", "hot", "lukewarm",
    "taste", "size", "small", "medium", "large", "fresh", "whole", "powder", "seeds", "oil", "leaves", "wedges", "fillet", "fillets", "boneless", "skinless",
    "water", "salt", "ice" 
}

def encode_image(file_bytes: bytes) -> str:
    return base64.b64encode(file_bytes).decode("utf-8")


def call_openrouter_with_fallback(payload: dict):
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://localhost:8000", # Required by OpenRouter 
        "X-Title": "LocalDev" # Required by OpenRouter
    }

    last_exception = None

    for model in VISION_MODELS:
        payload["model"] = model
        print(f"Trying model: {model}")

        for attempt in range(3):  # retry 3 times per model
            try:
                response = requests.post(
                    OPENROUTER_URL,
                    json=payload,
                    headers=headers,
                    timeout=60
                )

                if response.status_code == 200:
                    data = response.json()
                    if "choices" in data and len(data["choices"]) > 0:
                        return data, model
                    else:
                        print(f"Model {model} returned 200 but missing 'choices' or empty: {data}")
                        # Treat as error to try next model
                        last_exception = f"Model {model} returned invalid response format"
                        break # Try next model

                # Rate limit → retry with backoff
                if response.status_code == 429:
                    wait_time = (attempt + 1) * 2  # 2s, 4s, 6s
                    print(f"Rate limited on {model}, retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                
                # 404 Not Found → Skip immediately
                if response.status_code == 404:
                    print(f"Model {model} not found (404). Skipping.")
                    break # Break inner loop to try next model

                # Other errors → log and break to next model
                print(f"Error {response.status_code} with {model}: {response.text}")
                last_exception = f"Error {response.status_code}: {response.text}"
                break # Break inner loop to try next model

            except Exception as e:
                print(f"Exception with {model}: {e}")
                last_exception = str(e)
                # Don't break immediately on connection errors, maybe retry?
                # For now let's retry on exception too
                time.sleep(2) 

    # If all models fail
    raise HTTPException(
        status_code=500,
        detail=f"All models failed. Last error: {last_exception}"
    )

import re

def parse_ingredients_with_bboxes(text):
    """
    Parses text containing ingredients and bounding boxes.
    Expected format: 'Name [ymin, xmin, ymax, xmax]' or just 'Name'.
    Returns:
        - List of ingredient names (clean)
        - Dict mapping clean_name -> bbox_list
    """
    ingredients = []
    bbox_map = {}
    
    # Text can contain commas inside brackets, e.g. "Bhindi [100, 200, 300, 400]"
    # Simple split by comma would break the bbox.
    
    # Strategy: Replace commas inside [...] with semicolons temporarily
    temp_text = text
    def replace_comma(match):
        return match.group(0).replace(',', ';')
    
    temp_text = re.sub(r"\[.*?\]", replace_comma, text)
    
    # Now split by comma or newline
    items = re.split(r'[,\n]', temp_text)
    
    for item in items:
        item = item.strip()
        if not item: continue
        
        # Check for bbox [y; x; y; x] (semicolons)
        match = re.search(r"\[\s*(\d+)\s*;\s*(\d+)\s*;\s*(\d+)\s*;\s*(\d+)\s*\]", item)
        if match:
            # Extract name part (before the bracket)
            name_part = item[:match.start()].strip()
            name_clean = name_part.strip().strip(string.punctuation)
            
            bbox = [int(g) for g in match.groups()] # [ymin, xmin, ymax, xmax]
            
            if name_clean:
                ingredients.append(name_clean)
                bbox_map[name_clean.lower()] = bbox
        else:
            # Just a name
            name_clean = item.strip().strip(string.punctuation)
            if name_clean:
                ingredients.append(name_clean)
                
    return ingredients, bbox_map


def execute_with_retry(func, retries=3, delay=1, default=None):
    """
    Executes a function with retry logic for network-related errors.
    """
    for attempt in range(retries):
        try:
            return func()
        except (requests.exceptions.RequestException, socket.gaierror, Exception) as e:
            print(f"Attempt {attempt + 1}/{retries} failed for {func.__name__ if hasattr(func, '__name__') else 'unknown'}: {e}")
            if attempt < retries - 1:
                time.sleep(delay * (attempt + 1))  # Simple backoff
            else:
                print(f"All retries failed. Returning default.")
                return default

def clean_ingredient_text(text):
    text = text.lower()
    text = ''.join([i for i in text if not i.isdigit()])
    text = text.replace("/", " ").replace(".", " ")
    try:
        tokens = nltk.word_tokenize(text)
    except:
        tokens = text.split()
    clean_tokens = []
    for word in tokens:
        word = word.strip(string.punctuation)
        if not word: continue
        if word in COOKING_STOPWORDS: continue
        if word in stopwords.words('english'): continue
        if len(word) < 2: continue 
        clean_tokens.append(word)
    return ' '.join(clean_tokens)

def preprocess_text(text):
    return clean_ingredient_text(text)

def calculate_similarity(user_ingredients, user_prep_time, user_cook_time):
    if tfidf_vectorizer is None or tfidf_matrix is None or df_english is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    user_ingredients_text = preprocess_text(', '.join(user_ingredients))
    user_tfidf = tfidf_vectorizer.transform([user_ingredients_text])
    cosine_similarities = cosine_similarity(user_tfidf, tfidf_matrix)[0]

    max_prep = df_english['PrepTimeInMins'].max()
    max_cook = df_english['CookTimeInMins'].max()
    if max_prep == 0: max_prep = 1
    if max_cook == 0: max_cook = 1

    prep_time_similarity = 1 - abs(df_english['PrepTimeInMins'] - user_prep_time) / max_prep
    cook_time_similarity = 1 - abs(df_english['CookTimeInMins'] - user_cook_time) / max_cook

    min_length = min(len(cosine_similarities), len(prep_time_similarity), len(cook_time_similarity))
    cosine_similarities = cosine_similarities[:min_length]
    prep_time_similarity = prep_time_similarity[:min_length]
    cook_time_similarity = cook_time_similarity[:min_length]

    # Weight ingredients significantly higher (80%) than time (20%)
    combined_similarity = (cosine_similarities * 0.8) + (prep_time_similarity * 0.1) + (cook_time_similarity * 0.1)
    return combined_similarity

def get_recommendations_logic(user_ingredients_list, user_prep_time, user_cook_time, top_n=9):
    combined_similarity = calculate_similarity(user_ingredients_list, user_prep_time, user_cook_time)
    sorted_indices = combined_similarity.argsort()[::-1]
    top_indices = sorted_indices[:top_n]
    recommendations = df_english.iloc[top_indices].copy()
    
    if hasattr(combined_similarity, 'iloc'):
        scores = combined_similarity.iloc[top_indices] * 100
    else:
        scores = combined_similarity[top_indices] * 100
        
    recommendations['similarity_score'] = scores.astype(int).values
    return recommendations

def remove_metadata(image_bytes: bytes) -> bytes:
    """
    Strips EXIF metadata from an image byte stream.
    Returns the cleaned image as bytes.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        
        # Create a new image with the same mode and size.
        # This implementation simply saves the image again without the exif data.
        # Note: We need to respect the format if possible, default to JPEG.
        
        output_buffer = io.BytesIO()
        fmt = image.format if image.format else 'JPEG'
        
        # Save without passing 'exif' parameter strips it by default in PIL
        image.save(output_buffer, format=fmt)
        
        return output_buffer.getvalue()
    except Exception as e:
        print(f"Error stripping metadata: {e}")
        # If anything fails (e.g. not an image), return original bytes
        return image_bytes


def get_youtube_link(query):
    def _search():
        results = YoutubeSearch(query + " recipe", max_results=1).to_dict()
        if results:
            return f"https://www.youtube.com/watch?v={results[0]['id']}"
        return ""

    return execute_with_retry(_search, retries=3, delay=2, default="")

def analyze_perishability(ingredients_list, extra_text=""):
    if not ingredients_list and not extra_text:
        return []
    
    prompt = f"""
    You are an expert food safety assistant. Analyze the following ingredients and estimate their perishability.
    
    Detected Ingredients List: {', '.join(ingredients_list)}
    User Description: {extra_text}
    
    Task:
    1. Extract any additional ingredients from the 'User Description'.
    2. Combine them with the 'Detected Ingredients List'.
    3. Remove duplicates.
    4. For each ingredient, estimate:
       - "days_to_expiry": (int) estimated days until expiry (use 999 for non-perishables like salt/spices/rice)
       - "priority": (string) "High", "Medium", or "Low" based on urgency to use.
    
    STRICT Guidelines for Priority:
    - High (Red): Raw meats (Chicken, Beef, Pork), Seafood, Leafy Greens. Use within 1-3 days.
    - Medium (Yellow): Eggs, Milk, Soft Cheeses, Most Fresh Vegetables/Fruits. Use within 4-14 days.
    - Low (Green): Rice, Grains, Pasta, Hard Cheeses, Frozen Foods, Canned Goods, Spices. Use within 15+ days.

    Return ONLY a valid JSON array where each object has:
    - "name": (string) ingredient name (CLEAN UP NAMES: Remove adjectives, colors, categories, and parentheses. Example: "Red Tomatoes" -> "Tomatoes", "Root Vegetables (Yams)" -> "Yams")
    - "days_to_expiry": (int)
    - "priority": (string)
    
    Do not add any markdown formatting or extra text. Just the JSON.
    """
    
    try:
        response = ollama.chat(model='llama3', format='json', messages=[
            {'role': 'user', 'content': prompt},
        ])
        content = response['message']['content']
        clean_content = content.replace("```json", "").replace("```", "").strip()
        
        try:
             data = json.loads(clean_content)
        except json.JSONDecodeError:
             start = clean_content.find('[')
             end = clean_content.rfind(']')
             if start != -1 and end != -1:
                 data = json.loads(clean_content[start:end+1])
             else:
                 raise

        if isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, list):
                    return value
            return [data]
            
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
            
        return [] 
        
    except Exception as e:
        print(f"Error analyzing perishability: {e}")
        fallback_list = ingredients_list + (extra_text.split(',') if extra_text else [])
        return [{"name": ing.strip(), "days_to_expiry": 7, "priority": "Medium"} for ing in fallback_list if ing.strip()]

def generate_recipe_with_ollama(ingredients: List[str]) -> Recipe:
    print(f"Generating AI recipe for: {ingredients}")
    prompt = f"""
    Create a unique and delicious recipe using these ingredients: {', '.join(ingredients)}.
    You can assume standard pantry staples (salt, pepper, oil, water, spices).
    
    Return the recipe strictly in this JSON format:
    {{
        "name": "Recipe Name",
        "description": "Short description",
        "ingredients": "List of ingredients with quantities (e.g., '2 tomatoes, 1 onion')",
        "instructions": ["Step 1", "Step 2", "Step 3"],
        "prep_time": 15,
        "cook_time": 30,
        "cuisine": "Type of cuisine",
        "diet": "Vegetarian/Non-Veg/Vegan etc.",
        "course": "Main Course/Appetizer etc.",
        "servings": 2
    }}
    Ensure the JSON is valid and contains no markdown formatting.
    """
    
    try:
        response = ollama.chat(model='llama3', format='json', messages=[
            {'role': 'user', 'content': prompt},
        ])
        content = response['message']['content']
        data = json.loads(content)
        
        # Map to Recipe model
        # Using a negative ID to indicate AI generated
        return Recipe(
            id=-1,
            name=data.get("name", "AI Generated Recipe"),
            translated_name=data.get("name", "AI Generated Recipe"), # Placeholder
            ingredients=str(data.get("ingredients", "")), # Convert to string if it's a list? Model expects string usually or we standardized
            # The Recipe model expects string for ingredients usually based on CSV, let's check
            # In process_recipe_row it handles parsing. Here we can just provide a string representation.
            # If the LLM returns a list, join it.
            prep_time=int(data.get("prep_time", 15)),
            cook_time=int(data.get("cook_time", 15)),
            url="",
            youtube_link="", # Could try to search one but might be irrelevant
            missing_ingredients=[],
            match_score=95, # High score for custom generation
            instructions=data.get("instructions", ["Mix ingredients", "Cook well"]),
            cuisine=data.get("cuisine", "Fusion"),
            course=data.get("course", "Main Dish"),
            diet=data.get("diet", "Flexible"),
            servings=int(data.get("servings", 2))
        )
    except Exception as e:
        print(f"Error generating recipe with Ollama: {e}")
        # Return a dummy error recipe
        return Recipe(
            id=-1,
            name="Could not generate recipe",
            translated_name="Error",
            ingredients="None",
            prep_time=0,
            cook_time=0,
            url="",
            youtube_link="",
            missing_ingredients=[],
            match_score=0,
            instructions=["Please try again with different ingredients."],
            cuisine="None",
            course="None",
            diet="None",
            servings=0
        )

def process_recipe_row(row, user_ingredients_list=[]):
    ingreds = str(row['Ingredients']) if 'Ingredients' in row and pd.notna(row['Ingredients']) else "Not listed"
    recipe_name = str(row['RecipeName'])
    youtube_url = get_youtube_link(recipe_name)
    
    r_ing_list = []
    if ingreds.strip().startswith("[") and ingreds.strip().endswith("]"):
        import ast
        try:
            r_ing_list = ast.literal_eval(ingreds)
        except:
            r_ing_list = [x.strip() for x in ingreds.replace('[','').replace(']','').replace("'", "").split(',')]
    else:
        r_ing_list = [x.strip() for x in ingreds.split(',')]
    
    missing = []
    user_ings_lower = [u.lower() for u in user_ingredients_list]
    added_missing = set()

    for r_ing in r_ing_list:
        cleaned_r_ing = clean_ingredient_text(r_ing)
        if not cleaned_r_ing: continue

        match = False
        for u_ing in user_ings_lower:
            if u_ing in cleaned_r_ing or cleaned_r_ing in u_ing: 
                match = True
                break
        
        if not match: 
            display_name = cleaned_r_ing.title()
            if display_name not in added_missing:
                link = f"https://blinkit.com/s/?q={display_name.replace(' ', '+')}"
                missing.append({"name": display_name, "link": link})
                added_missing.add(display_name)

    return Recipe(
        id=int(row['Srno']) if 'Srno' in row else 0,
        name=recipe_name,
        translated_name=str(row.get('TranslatedRecipeName', '')),
        ingredients=ingreds,
        prep_time=int(row['PrepTimeInMins']),
        cook_time=int(row['CookTimeInMins']),
        url=str(row['URL']),
        youtube_link=youtube_url,
        missing_ingredients=missing,
        match_score=int(row['similarity_score']) if 'similarity_score' in row else 0,
        instructions=nltk.sent_tokenize(str(row['Instructions'])) if 'Instructions' in row and pd.notna(row['Instructions']) else [],
        cuisine=str(row['Cuisine']) if 'Cuisine' in row else "",
        course=str(row['Course']) if 'Course' in row else "",
        diet=str(row['Diet']) if 'Diet' in row else "",
        servings=int(row['Servings']) if 'Servings' in row else 0
    )

def apply_profile_filters(recipes_df, constraints):
    filtered_df = recipes_df.copy()
    filtered_df['Ingredients'] = filtered_df['Ingredients'].fillna('')

    for allergy in constraints.get("allergies", []):
         if not allergy: continue
         filtered_df = filtered_df[~filtered_df['Ingredients'].str.contains(allergy, case=False, na=False)]

    diets = constraints.get("dietary_preferences", []) 
    meats = ["chicken", "beef", "pork", "lamb", "fish", "shrimp", "meat", "bacon", "ham", "sausage", "seafood"]
    dairy_eggs = ["egg", "milk", "cheese", "yogurt", "cream", "butter", "ghee"]
    
    if "Vegetarian" in diets or "Vegan" in diets:
         pattern = '|'.join(meats)
         filtered_df = filtered_df[~filtered_df['Ingredients'].str.contains(pattern, case=False, na=False)]
    
    if "Vegan" in diets:
        pattern = '|'.join(dairy_eggs + ["honey"])
        filtered_df = filtered_df[~filtered_df['Ingredients'].str.contains(pattern, case=False, na=False)]
        
    if "Gluten-Free" in diets:
        gluten = ["wheat", "barley", "rye", "flour", "bread", "pasta"] 
        pattern = '|'.join(gluten)
        filtered_df = filtered_df[~filtered_df['Ingredients'].str.contains(pattern, case=False, na=False)]
    return filtered_df

# --- Endpoints ---

@app.post("/register", response_model=Token)
def register(user: UserCreate):
    users_collection = get_users_collection()
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    if users_collection.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    default_profile = {
        "name": user.email.split("@")[0],
        "experience_level": "Intermediate",
        "dietary_preferences": [],
        "allergies": [],
        "health_goals": []
    }
    
    new_user = {
        "email": user.email,
        "hashed_password": hashed_password,
        "is_admin": False,
        "profile": default_profile,
        "interactions": []
    }
    
    users_collection.insert_one(new_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    users_collection = get_users_collection()
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user = users_collection.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/profile")
def get_profile(current_user: UserInDB = Depends(get_current_user)):
    profile_data = current_user.profile.copy()
    profile_data["interactions"] = current_user.interactions
    profile_data["is_admin"] = current_user.is_admin
    return profile_data

@app.post("/profile")
def update_profile(profile_update: UserProfileUpdate, current_user: UserInDB = Depends(get_current_user)):
    users_collection = get_users_collection()
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    updates = {k: v for k, v in profile_update.model_dump().items() if v is not None}
    
    if not updates:
        return current_user.profile

    mongo_updates = {f"profile.{k}": v for k, v in updates.items()}
    
    users_collection.update_one(
        {"email": current_user.email},
        {"$set": mongo_updates}
    )
    
    new_profile = current_user.profile.copy()
    new_profile.update(updates)
    return new_profile

@app.post("/interaction")
def log_interaction(interaction: InteractionRequest, current_user: UserInDB = Depends(get_current_user)):
    users_collection = get_users_collection()
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    new_interaction = {
        "timestamp": str(datetime.now()),
        "action": interaction.action,
        "recipe_name": interaction.recipe_name,
        "details": interaction.details or {}
    }
    
    users_collection.update_one(
        {"email": current_user.email},
        {"$push": {"interactions": new_interaction}}
    )
    return {"status": "success"}

@app.post("/recommend", response_model=List[Recipe])
def recommend_recipes_endpoint(request: RecipeRequest, current_user: Optional[UserInDB] = Depends(get_current_user)):
    if df_english is None:
        raise HTTPException(status_code=503, detail="Model failed to load.")

    try:
        raw_list = [i.strip() for i in request.ingredients.split(',')]
        ingredients_list = []
        for i in raw_list:
            cleaned = clean_ingredient_text(i)
            if cleaned:
                ingredients_list.append(cleaned)
        
        if not ingredients_list and raw_list:
             ingredients_list = [r for r in raw_list if r]

        base_recs = get_recommendations_logic(ingredients_list, request.prep_time, request.cook_time, top_n=50)
        
        if current_user:
             constraints = {
                 "allergies": current_user.profile.get("allergies", []),
                 "dietary_preferences": current_user.profile.get("dietary_preferences", []),
             }
             filtered_recs = apply_profile_filters(base_recs, constraints)
        else:
             filtered_recs = base_recs
        
        # Check if we have good matches
        top_recs = filtered_recs.head(9)
        best_score = 0
        if not top_recs.empty:
            if 'similarity_score' in top_recs.columns:
                best_score = top_recs.iloc[0]['similarity_score']
        
        # Threshold for fallback (e.g. < 30% match)
        results = []
        if top_recs.empty or best_score < 30:
            print(f"Match score {best_score}% is below threshold (30%). Triggering Ollama fallback...")
            ai_recipe = generate_recipe_with_ollama(ingredients_list)
            results.append(ai_recipe)
            
            # Still append the best partial matches if any
            if not top_recs.empty:
                 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                     func = lambda r: process_recipe_row(r, ingredients_list)
                     partials = list(executor.map(func, [row for _, row in top_recs.iterrows()]))
                     results.extend(partials)
        else:
             with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                  func = lambda r: process_recipe_row(r, ingredients_list)
                  results = list(executor.map(func, [row for _, row in top_recs.iterrows()]))
            
        return results

    except Exception as e:
        print(f"Error generating recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/detect-ingredients")
async def detect_ingredients(file: UploadFile = File(None), text_input: str = Form(None)):
    if not file and not text_input:
        raise HTTPException(status_code=400, detail="Either an image file or text input is required.")

    try:
        detected_text = ""
        used_model = "None"
        
        if file:
            if not file.content_type.startswith("image/"):
                 raise HTTPException(status_code=400, detail="Only image files are allowed")
            
            image_bytes = await file.read()
            
            # Privacy: Remove metadata before sending to AI
            image_bytes = remove_metadata(image_bytes)
            
            image_base64 = encode_image(image_bytes)

            payload = {
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Identify the food ingredients in this image. For EACH ingredient, provide its name (use Indian English, e.g. 'Brinjal', 'Bhindi') AND its Bounding Box. Format: 'Name [ymin, xmin, ymax, xmax]'. Coordinates must be normalized to 0-1000 scale. Examples: 'Brinjal [150, 200, 350, 400]', 'Onion [500, 600, 600, 700]'. Return a list."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{file.content_type};base64,{image_base64}"
                                }
                            }
                        ]
                    }
                ]
            }
            
            # Run blocking code in threadpool
            result, used_model = await run_in_threadpool(call_openrouter_with_fallback, payload)
            detected_text = result["choices"][0]["message"]["content"]
            print(f"OpenRouter Detection ({used_model}): {detected_text}")

        # Parse detected text for bboxes
        detected_ingredients_list, bbox_map = parse_ingredients_with_bboxes(detected_text)
        
        # Combine text input and detected text for perishability analysis
        # If text input exists, add it to the list
        if text_input:
             detected_ingredients_list.extend([t.strip() for t in text_input.split(',') if t.strip()])

        # Pass specific list to analyze_perishability
        prioritized_ingredients = analyze_perishability(detected_ingredients_list, extra_text="")
        
        # Merge bboxes back into the result
        filtered_results = []
        seen_names = set()
        
        for item in prioritized_ingredients:
            name = item.get("name", "")
            if not name: continue
            
            # Normalize name for lookup
            # The LLM might have slightly changed the name (e.g. capitalized)
            # We try to find a matching bbox in our map
            
            # Check exact match lower
            bbox = bbox_map.get(name.lower())
            
            # If not found, try simple partial match
            if not bbox:
                 for mapped_name, mapped_bbox in bbox_map.items():
                     if mapped_name in name.lower() or name.lower() in mapped_name:
                         bbox = mapped_bbox
                         break
            
            item["bbox"] = bbox # Can be None
            
            if name.lower() not in seen_names:
                filtered_results.append(item)
                seen_names.add(name.lower())

        filtered_results.sort(key=lambda x: x.get('days_to_expiry', 999))
        
        return {"detected_ingredients": filtered_results}
        
    except Exception as e:
        print(f"Error during detection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/verify-step")
async def verify_cooking_step(file: UploadFile = File(...), instruction: str = Form(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    try:
        image_bytes = await file.read()
        
        # Privacy: Remove metadata before sending to AI
        image_bytes = remove_metadata(image_bytes)
        
        image_base64 = encode_image(image_bytes)

        prompt = f"""
        You are a friendly Indian Chef assistant. 
        I am currently cooking and following this step: "{instruction}". 
        
        Please look at the attached image of my cooking. 
        Does it look correct according to the instruction? 
        
        If it looks correct, say 'Looks perfect ji!'. 
        If not, explain what is wrong and how to fix it in simple Indian English.
        Keep your response concise and helpful.
        """

        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{file.content_type};base64,{image_base64}"
                            }
                        }
                    ]
                }
            ]
        }

        # Run blocking code in threadpool
        result, used_model = await run_in_threadpool(call_openrouter_with_fallback, payload)
        feedback = result["choices"][0]["message"]["content"]
        print(f"Step Verification ({used_model}): {feedback}")
        
        return {"feedback": feedback}

    except Exception as e:
        print(f"Error during step verification: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_with_chef(
    text_input: str = Form(...),
    file: UploadFile = File(None),
    context: str = Form(...), # JSON string: {recipe_name, step_label, instruction}
    history: str = Form(None) # JSON string: list of {role, content}
):
    try:
        # Parse Context
        import json
        ctx = json.loads(context)
        recipe_name = ctx.get("recipe_name", "Unknown Recipe")
        step_label = ctx.get("step_label", "General")
        instruction = ctx.get("instruction", "")
        
        # Parse History (if needed for context, usually last few messages)
        # For this simple implementation, we might just rely on immediate context + user query
        # But let's check if we want to include history in the prompt.
        chat_history = []
        if history:
            chat_history = json.loads(history)

        # System Prompt
        system_instruction = f"""
        You are a friendly and encouraging Indian Chef assistant.
        The user is cooking "{recipe_name}".
        Current Context: {step_label} - "{instruction}".
        
        Your Goal: Help the user with this step, answer their questions, or verify their progress if they share an image.
        Personality: Warm, helpful, speaks in Indian English (e.g., uses "ji", "beta", "don't worry").
        
        Guidelines:
        - Keep answers concise (1-2 paragraphs max) as the user is busy cooking.
        - If they send an image, analyze it relative to the current step instruction.
        - If they ask for help, explain simply.
        """
        
        # Construct Messages for OpenRouter
        messages = []
        
        # We can't easily add a separate "system" role message for some VLM models, 
        # so we often prepend it to the user message or use it if supported.
        # OpenRouter/OpenAI usually supports developer/system messages, but for safety with VLMs, 
        # let's prepend context to the user prompt.
        
        user_content_blocks = []
        
        # Add System Context as text
        user_content_blocks.append({
            "type": "text", 
            "text": f"SYSTEM INSTRUCTION: {system_instruction}\n\nUSER MESSAGE: {text_input}"
        })
        
        if file:
            if not file.content_type.startswith("image/"):
                raise HTTPException(status_code=400, detail="Only image files are allowed")
            image_bytes = await file.read()
            image_base64 = encode_image(image_bytes)
            user_content_blocks.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{file.content_type};base64,{image_base64}"
                }
            })
            print("Image attached to chat.")

        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": user_content_blocks
                }
            ]
        }

        # Run blocking code in threadpool
        result, used_model = await run_in_threadpool(call_openrouter_with_fallback, payload)
        message_content = result["choices"][0]["message"]["content"]
        print(f"Chat Response ({used_model}): {message_content[:50]}...")
        
        return {"response": message_content}

    except Exception as e:
        print(f"Error during chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/recipe/{recipe_id}", response_model=Recipe)
def get_recipe_details(recipe_id: int):
    # mongo_recipes = get_recipe_collection()
    # if mongo_recipes is not None:
    #     doc = mongo_recipes.find_one({"Srno": recipe_id})
    #     if doc:
    #         return process_recipe_row(doc, user_ingredients_list=[])
    
    if df_english is None:
         raise HTTPException(status_code=503, detail="Model not loaded")
         
    row = df_english[df_english['Srno'] == recipe_id]
    if row.empty:
        raise HTTPException(status_code=404, detail="Recipe not found")
        
    return process_recipe_row(row.iloc[0], user_ingredients_list=[])

@app.post("/translate")
def translate_text(request: TranslationRequest):
    def _translate():
        return GoogleTranslator(source='auto', target=request.target_lang).translate(request.text)

    try:
        translated = execute_with_retry(_translate, retries=3, delay=1)
        if not translated:
            return {"translated_text": request.text}
        return {"translated_text": translated}
    except Exception as e:
        print(f"Translation error after retries: {e}")
        return {"translated_text": request.text}

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(to_email: str, subject: str, html_content: str):
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    email_from = os.getenv("EMAIL_FROM", "noreply@ai-chef.com")

    if not smtp_user or not smtp_password:
        print("SMTP credentials not set. Skipping email.")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = email_from
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(html_content, 'html'))

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        print(f"Email sent successfully to {to_email}")
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False

@app.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest):
    token = base64.urlsafe_b64encode(request.email.encode()).decode()
    reset_link = f"http://localhost:5173/reset-password?token={token}"
    
    print(f"Password recovery requested for: {request.email}")
    print(f"Recover your password here: {reset_link}") # Keep log as backup

    # Send Email
    email_body = f"""
    <h2>Password Recovery</h2>
    <p>We received a request to reset your password for AI Chef Assistant.</p>
    <p>Click the link below to reset it:</p>
    <a href="{reset_link}">{reset_link}</a>
    <p>If you didn't ask for this, please ignore this email.</p>
    """
    
    send_email(request.email, "Reset Your Password - AI Chef", email_body)

    return {"message": "If this email is registered, a recovery link has been sent."}

@app.post("/reset-password")
def reset_password(request: ResetPasswordRequest):
    users_collection = get_users_collection()
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        email = base64.urlsafe_b64decode(request.token).decode()
    except:
        raise HTTPException(status_code=400, detail="Invalid token")
        
    user = users_collection.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    new_hash = get_password_hash(request.new_password)
    users_collection.update_one({"email": email}, {"$set": {"hashed_password": new_hash}})
    return {"message": "Password updated successfully"}

@app.get("/admin/users")
def get_all_users(current_user: UserInDB = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have admin privileges")
    
    users_collection = get_users_collection()
    users = list(users_collection.find())
    
    stats = []
    for u in users:
        interactions = u.get("interactions", [])
        likes = sum(1 for i in interactions if isinstance(i, dict) and i.get('action') == 'like')
        stats.append({
            "email": u["email"],
            "id": str(u.get("_id", "unknown")),
            "is_admin": u.get("is_admin", False),
            "joined_at": "2024-01-01", 
            "total_interactions": len(interactions),
            "total_likes": likes
        })
        
    return stats

@app.post("/admin/promote")
def promote_user(email: str):
    users_collection = get_users_collection()
    user = users_collection.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    users_collection.update_one({"email": email}, {"$set": {"is_admin": True}})
    return {"message": f"User {email} is now an admin"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)