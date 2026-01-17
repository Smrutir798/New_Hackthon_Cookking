
import json
import os
from typing import Dict, List, Any
from datetime import datetime

class UserManager:
    def __init__(self, data_dir: str = "data", filename: str = "user_profile.json"):
        self.data_dir = data_dir
        self.filepath = os.path.join(data_dir, filename)
        self.profile = self._load_or_create_profile()

    def _load_or_create_profile(self) -> Dict[str, Any]:
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)
        
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                print("Error decoding user profile. Resetting to default.")
        
        # Default Profile Structure
        default_profile = {
            "name": "Guest Cook",
            "experience_level": "intermediate", # beginner, intermediate, advanced
            "dietary_preferences": [], # vegetarian, vegan, gluten-free, etc.
            "allergies": [],
            "health_goals": [], # low-carb, high-protein
            "explicit_preferences": {
                "liked_cuisines": [],
                "disliked_ingredients": []
            },
            "interactions": [] # history of viewed/liked recipes
        }
        self._save_profile(default_profile)
        return default_profile

    def _save_profile(self, profile: Dict[str, Any]):
        with open(self.filepath, 'w') as f:
            json.dump(profile, f, indent=4)

    def get_profile(self) -> Dict[str, Any]:
        return self.profile

    def update_profile(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Updates basic info, dietary prefs, allergies, goals."""
        for key, value in updates.items():
            if key in self.profile:
                self.profile[key] = value
        self._save_profile(self.profile)
        return self.profile

    def add_interaction(self, action: str, recipe_name: str, details: Dict[str, Any] = None):
        """Log user interaction (view, like, cook)."""
        interaction = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "recipe_name": recipe_name,
            "details": details or {}
        }
        self.profile["interactions"].append(interaction)
        # Keep interactions list manageable? For now, keep all.
        self._save_profile(self.profile)

    def get_user_constraints(self):
        """Returns specific constraints for recipe filtering."""
        return {
            "allergies": self.profile.get("allergies", []),
            "diet": self.profile.get("dietary_preferences", []),
            "disliked": self.profile.get("explicit_preferences", {}).get("disliked_ingredients", [])
        }
