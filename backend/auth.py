from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from database import get_users_collection

# Configuration
SECRET_KEY = "CHANGE_THIS_TO_A_SUPER_SECRET_KEY_IN_PRODUCTION" # In prod usage env var
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 3000 # Long expiry for convenience

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# User Model for Auth
# We use this to type-hint the object returned by get_current_user
class UserInDB(BaseModel):
    id: Optional[str] = None # MongoDB _id handled manually or mapped
    email: str
    hashed_password: str
    is_admin: bool = False
    profile: Dict[str, Any] = {}
    interactions: List[Dict[str, Any]] = []

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    users_collection = get_users_collection()
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
        
    user_doc = users_collection.find_one({"email": email})
    if user_doc is None:
        raise credentials_exception
    
    # Map to Pydantic model
    return UserInDB(
        email=user_doc["email"],
        hashed_password=user_doc["hashed_password"],
        is_admin=user_doc.get("is_admin", False),
        profile=user_doc.get("profile", {}),
        interactions=user_doc.get("interactions", [])
    )
