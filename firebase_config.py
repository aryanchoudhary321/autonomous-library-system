import os
import firebase_admin
from firebase_admin import credentials, firestore, auth

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Check for both standard camelCase and lowercase key filename variants
key_path_camel = os.path.join(BASE_DIR, "serviceAccountKey.json")
key_path_lower = os.path.join(BASE_DIR, "serviceAccountkey.json")

if os.path.exists(key_path_camel):
    cred_file = key_path_camel
elif os.path.exists(key_path_lower):
    cred_file = key_path_lower
else:
    raise FileNotFoundError(
        "Service account key file not found. Ensure 'serviceAccountKey.json' or 'serviceAccountkey.json' is present in the root directory."
    )

if not firebase_admin._apps:
    cred = credentials.Certificate(cred_file)
    firebase_admin.initialize_app(cred)

# Export Firestore database client and Auth module
db = firestore.client()
# auth is imported directly from firebase_admin and exported
__all__ = ["db", "auth"]
