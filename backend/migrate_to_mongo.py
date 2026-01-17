
import pickle
import pandas as pd
from pymongo import MongoClient
import os
import sys

# Constants
MODEL_PATH = "recipe_recommender_model.pkl"
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "ai_cooking_db"
COLLECTION_NAME = "recipes"

def migrate():
    # 1. Load Data
    print(f"Loading model from {MODEL_PATH}...")
    if not os.path.exists(MODEL_PATH):
        print("Model file not found!")
        sys.exit(1)
        
    with open(MODEL_PATH, 'rb') as f:
        model_data = pickle.load(f)
        
    df = model_data['dataframe']
    print(f"Loaded {len(df)} recipes from pickle.")
    
    # 2. Connect to Mongo
    print(f"Connecting to MongoDB at {MONGO_URI}...")
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    
    # 3. Check existing
    count = collection.count_documents({})
    if count > 0:
        print(f"Collection '{COLLECTION_NAME}' already has {count} documents.")
        choice = input("Do you want to clear the collection and re-import? (y/n): ")
        if choice.lower() == 'y':
            collection.delete_many({})
            print("Collection cleared.")
        else:
            print("Aborting migration.")
            return

    # 4. Convert DataFrame to Records
    print("Converting DataFrame to dictionary records...")
    # Convert NaNs to None/null for valid JSON
    df_clean = df.where(pd.notnull(df), None)
    records = df_clean.to_dict(orient='records')
    
    # Ensure ID match (Srno -> _id if we want, or just verify Srno exists)
    # Let's keep _id as Mongo's ObjectId for internal use, and index Srno
    
    # 5. Insert
    print(f"Inserting {len(records)} records...")
    if records:
        collection.insert_many(records)
        
    # 6. Indexing
    print("Creating index on 'Srno'...")
    collection.create_index("Srno", unique=True)
    
    # 7. Verify
    new_count = collection.count_documents({})
    print(f"Migration Complete. Total documents in DB: {new_count}")

if __name__ == "__main__":
    migrate()
