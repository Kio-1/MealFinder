import pandas as pd
import numpy as np
import time
import math
from supabase import create_client, Client

# 1. ADD YOUR SUPABASE CREDENTIALS HERE
# Use the 'service_role' secret key (not the anon key) to bypass security rules during upload
SUPABASE_URL = "https://phpkmafryveyvcnpifsf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBocGttYWZyeXZleXZjbnBpZnNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODE1Nzc0MCwiZXhwIjoyMTAzNzMzNzQwfQ.zpL102Gi7zjjKUMYN79iznX9pbMTMM73NRX_xUgkrlM"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("Loading local Parquet data...")
# Load the cleaned dataset
df = pd.read_parquet('data/cleaned_recipes.parquet')

# 2. CLEAN UP FOR JSON UPLOAD
# Supabase/JSON cannot read Pandas 'NaN' (Not a Number), so we convert them to Python 'None' (Null)
df = df.replace({np.nan: None})

# Ensure the list columns are strictly Python lists, not Numpy arrays
for col in ['tags', 'ingredients', 'steps']:
    if col in df.columns:
        df[col] = df[col].apply(lambda x: list(x) if isinstance(x, (list, np.ndarray)) else [])

# 3. CONVERT TO DICTIONARIES
print("Converting to dictionary format...")
records = df.to_dict(orient='records')

# 4. CHUNKED UPLOAD LOGIC
chunk_size = 2500
total_chunks = math.ceil(len(records) / chunk_size)

print(f"Starting upload in {total_chunks} chunks...")

for i in range(total_chunks):
    chunk = records[i * chunk_size : (i + 1) * chunk_size]
    try:
        # Fire the chunk into the Supabase 'recipes' table
        supabase.table('recipes').insert(chunk).execute()
        print(f"Uploaded chunk {i+1}/{total_chunks}")
        
        # CRITICAL: Pause to let Supabase clear its transaction logs (WAL)
        time.sleep(1.5) 
    except Exception as e:
        print(f"Error on chunk {i+1}: {e}")
        # Pause slightly longer if it hits a rate limit
        time.sleep(5)

print("✅ Data Migration Complete!")