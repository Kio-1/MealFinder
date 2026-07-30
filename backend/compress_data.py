import pandas as pd
import pickle
import scipy.sparse

print("Loading massive pickle files (this takes a moment)...")
df = pd.read_pickle('data/cleaned_recipes.pkl')

with open('data/tfidf_matrix.pkl', 'rb') as f:
    tfidf_matrix = pickle.load(f)

print("Compressing DataFrame to Parquet format...")
df.to_parquet('data/cleaned_recipes.parquet', engine='pyarrow')

print("Compressing TF-IDF Matrix to NPZ format...")
scipy.sparse.save_npz('data/tfidf_matrix.npz', tfidf_matrix)

print("✅ Success! Your data is compressed.")
print("You can now safely DELETE 'cleaned_recipes.pkl' and 'tfidf_matrix.pkl' so they don't block your GitHub push.")