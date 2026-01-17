from pymongo import MongoClient
import os

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "ai_cooking_db"

mongo_client = None
mongo_db = None

try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2000)
    # Trigger a connection attempt
    mongo_client.server_info()
    print("Connected to MongoDB successfully.")
    mongo_db = mongo_client[DB_NAME]
except Exception as e:
    print(f"FAILED to connect to MongoDB: {e}")
    mongo_client = None
    mongo_db = None

def get_recipe_collection():
    if mongo_db is not None:
        return mongo_db["recipes"]
    return None

def get_users_collection():
    if mongo_db is not None:
        return mongo_db["users"]
    return None

