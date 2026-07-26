import pandas as pd
import ast

print("Loading dataset...")
df = pd.read_csv('data/RAW_recipes.csv')

print(f"Original recipe count: {len(df)}")

# 1. Drop unnecessary columns to save memory
cols_to_drop = ['contributor_id', 'submitted', 'n_steps','n_ingredients','id','']
df = df.drop(columns=cols_to_drop, errors='ignore')

# 2. Drop any corrupted rows missing a name or nutrition info
df = df.dropna(subset=['name', 'nutrition'])

# Randomly sample 25,000 recipes for the fast prototype
df = df.sample(n=50000, random_state=42).reset_index(drop=True)

# 3. Convert the string representation of lists into actual Python lists
print("Converting string lists to Python lists (this will take a few seconds)...")
df['tags'] = df['tags'].apply(ast.literal_eval)
df['nutrition'] = df['nutrition'].apply(ast.literal_eval)
df['ingredients'] = df['ingredients'].apply(ast.literal_eval)

# 4. Extract Calories (index 0) and Protein (index 4) into separate columns
df['calories'] = df['nutrition'].apply(lambda x: x[0])
df['protein'] = df['nutrition'].apply(lambda x: x[4])
df['calories'] = df['calories'].round().astype(int)
df['protein'] = df['protein'].round().astype(int)
df['description'] = df['description'].fillna('')
df = df.drop(columns='nutrition', errors='ignore')

# 5. Check our work
print("\nData cleaning complete! Here is a peek at our new structure:")
print(df.head())


print(f"Final recipe count: {len(df)}")

#saving the data to a pickle file
df.to_pickle('data/cleaned_recipes.pkl')