from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import pickle
import json
import scipy.sparse
import ast
from datetime import datetime

app = Flask(__name__)
CORS(app) 

# --- DATABASE SIMULATION ---
def load_users():
    try:
        with open('users.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def save_users(data):
    with open('users.json', 'w') as f:
        json.dump(data, f, indent=4)

# --- BULLETPROOF INGREDIENT PARSER ---
def safe_parse_ingredients(val):
    if isinstance(val, list):
        return [str(i).strip() for i in val]
    if isinstance(val, np.ndarray):
        return [str(i).strip() for i in val.tolist()]
    if isinstance(val, str):
        try:
            # Try to evaluate string representations like "['chicken', 'salt']"
            parsed = ast.literal_eval(val)
            if isinstance(parsed, list):
                return [str(i).strip() for i in parsed]
        except:
            pass
        # Fallback: manually strip brackets and split by comma
        cleaned = val.replace('[', '').replace(']', '').replace("'", "").replace('"', '')
        if ',' in cleaned:
            return [i.strip() for i in cleaned.split(',') if i.strip()]
        return [cleaned.strip()]
    return []

# --- LOAD MODELS ---
print("Loading Database and AI Models into memory...")
df = pd.read_parquet('data/cleaned_recipes.parquet')
with open('data/vectorizer.pkl', 'rb') as f:
    vectorizer = pickle.load(f)
tfidf_matrix = scipy.sparse.load_npz('data/tfidf_matrix.npz')
print("Backend Ready!")

# ==========================================
# API ENDPOINTS
# ==========================================
@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"status": "MealFinder Backend Online"})

@app.route('/api/user/<username>', methods=['GET'])
def get_user_profile(username):
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"profile": users_db[username]})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    sex = data.get('sex', 'Male')
    age = int(data.get('age', 19))
    height = float(data.get('height', 181))
    weight = float(data.get('weight', 88))
    goal_weight = float(data.get('goal_weight', 80))
    activity = data.get('activity', 'Medium')
    
    users_db = load_users()
    if username in users_db:
        return jsonify({"error": "Username exists!"}), 400

    bmr = (10 * weight) + (6.25 * height) - (5 * age) + (5 if sex == "Male" else -161)
    maintenance = bmr * 1.55
    target_cals = int(maintenance - 500 if goal_weight < weight else maintenance + 500 if goal_weight > weight else maintenance)
    target_pro = int(weight * 2)
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    users_db[username] = {
        "stats": {"sex": sex, "age": age, "height": height, "weight": weight, "activity": activity},
        "goals": {"goal_weight": goal_weight},
        "macros": {"target_cals": target_cals, "target_pro": target_pro},
        "history": {},
        "weight_history": {now_str: weight},
        "wishlist": [] 
    }
    save_users(users_db)
    return jsonify({"message": "Profile created!"})

@app.route('/api/update-profile', methods=['POST'])
def update_profile():
    data = request.json
    username = data.get('username')
    weight = float(data.get('weight'))
    goal_weight = float(data.get('goal_weight'))
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404

    stats = users_db[username]['stats']
    bmr = (10 * weight) + (6.25 * stats['height']) - (5 * stats['age']) + (5 if stats['sex'] == "Male" else -161)
    maintenance = bmr * 1.55
    
    target_cals = int(maintenance - 500 if goal_weight < weight else maintenance + 500 if goal_weight > weight else maintenance)
    target_pro = int(weight * 2)

    users_db[username]['stats']['weight'] = weight
    users_db[username]['goals']['goal_weight'] = goal_weight
    users_db[username]['macros'] = {"target_cals": target_cals, "target_pro": target_pro}

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    users_db[username]['weight_history'][now_str] = weight

    save_users(users_db)
    return jsonify({"message": "Profile updated!", "profile": users_db[username]})

@app.route('/api/log-food', methods=['POST'])
def log_food():
    data = request.json
    username = data.get('username')
    today = datetime.now().strftime("%Y-%m-%d")
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404

    if today not in users_db[username]['history']:
        users_db[username]['history'][today] = []

    users_db[username]['history'][today].append({
        "name": data.get('name'),
        "calories": int(data.get('calories', 0)),
        "protein": int(data.get('protein', 0))
    })
    save_users(users_db)
    return jsonify({"message": "Logged successfully!", "profile": users_db[username]})

@app.route('/api/log-combo', methods=['POST'])
def log_combo():
    data = request.json
    username = data.get('username')
    meal_names = data.get('meals', [])
    today = datetime.now().strftime("%Y-%m-%d")
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404

    if today not in users_db[username]['history']:
        users_db[username]['history'][today] = []

    for name in meal_names:
        recipe = df[df['name'] == name]
        if not recipe.empty:
            users_db[username]['history'][today].append({
                "name": name,
                "calories": int(recipe.iloc[0]['calories']),
                "protein": int(recipe.iloc[0]['protein'])
            })
            
    save_users(users_db)
    return jsonify({"message": "Combo logged successfully!", "profile": users_db[username]})

@app.route('/api/remove-food', methods=['POST'])
def remove_food():
    data = request.json
    username = data.get('username')
    index = data.get('index')
    
    users_db = load_users()
    today = datetime.now().strftime("%Y-%m-%d")

    if username in users_db and today in users_db[username]['history']:
        try:
            users_db[username]['history'][today].pop(index)
            save_users(users_db)
            return jsonify({"message": "Food removed!", "profile": users_db[username]})
        except IndexError:
            return jsonify({"error": "Invalid meal index"}), 400

    return jsonify({"error": "Record not found"}), 404

@app.route('/api/log-weight', methods=['POST'])
def log_weight():
    data = request.json
    username = data.get('username')
    new_weight = float(data.get('weight'))

    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    users_db[username]['stats']['weight'] = new_weight
    users_db[username]['weight_history'][now_str] = new_weight

    save_users(users_db)
    return jsonify({"message": "Weight logged!", "profile": users_db[username]})

@app.route('/api/wishlist/toggle', methods=['POST'])
def toggle_wishlist():
    data = request.json
    username = data.get('username')
    recipe = data.get('recipe') 
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404
        
    if 'wishlist' not in users_db[username]:
        users_db[username]['wishlist'] = []
        
    wishlist = users_db[username]['wishlist']
    exists = any(r['name'] == recipe['name'] for r in wishlist)
    
    if exists:
        users_db[username]['wishlist'] = [r for r in wishlist if r['name'] != recipe['name']]
    else:
        users_db[username]['wishlist'].append(recipe)
        
    save_users(users_db)
    return jsonify({"message": "Wishlist updated!", "profile": users_db[username]})

# NEW: Add entire combo to wishlist
@app.route('/api/wishlist/add-combo', methods=['POST'])
def add_combo_wishlist():
    data = request.json
    username = data.get('username')
    meal_names = data.get('meals', [])
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404
        
    if 'wishlist' not in users_db[username]:
        users_db[username]['wishlist'] = []
        
    wishlist = users_db[username]['wishlist']
    added_count = 0
    
    for name in meal_names:
        if not any(r['name'] == name for r in wishlist):
            recipe_row = df[df['name'] == name]
            if not recipe_row.empty:
                row = recipe_row.iloc[0]
                recipe_obj = {
                    "name": str(row.get("name", "")),
                    "calories": int(row.get("calories", 0)) if pd.notnull(row.get("calories")) else 0,
                    "protein": int(row.get("protein", 0)) if pd.notnull(row.get("protein")) else 0,
                    "minutes": int(row.get("minutes", 0)) if pd.notnull(row.get("minutes")) else 0,
                    "ingredients": safe_parse_ingredients(row.get("ingredients", "[]"))
                }
                users_db[username]['wishlist'].append(recipe_obj)
                added_count += 1
                
    save_users(users_db)
    return jsonify({"message": f"{added_count} new meals added to Groceries!", "profile": users_db[username]})

@app.route('/api/search', methods=['POST'])
def search():
    data = request.json
    query = data.get('query', '')
    tags_filter = data.get('tags', [])
    top_n = 10

    query_to_search = query if query else ""
    if tags_filter:
        query_to_search = query_to_search + ' ' + ' '.join(tags_filter)

    exact_matches = pd.DataFrame()
    if query:
        exact_mask = df['name'].str.contains(query, case=False, na=False)
        exact_matches = df[exact_mask].copy()
        if not exact_matches.empty:
            exact_matches['name_length'] = exact_matches['name'].str.len()
            exact_matches = exact_matches.sort_values('name_length').drop(columns=['name_length'])
            if tags_filter:
                mask = exact_matches['tags'].apply(lambda t: any(tag in t for tag in tags_filter))
                exact_matches = exact_matches[mask]

    query_vec = vectorizer.transform([query_to_search])
    similarity_scores = tfidf_matrix.dot(query_vec.T).toarray().flatten()
    
    math_matches = pd.DataFrame()
    if np.max(similarity_scores) > 0:
        top_indices = np.argsort(similarity_scores)[-top_n:][::-1]
        math_matches = df.iloc[top_indices].copy()

    results = pd.concat([exact_matches, math_matches]).drop_duplicates(subset=['name']).head(top_n)
    
    if results.empty:
        return jsonify({"results": []})
        
    safe_cols = ['name', 'calories', 'protein', 'minutes', 'description', 'ingredients']
    for col in safe_cols:
        if col not in results.columns:
            results[col] = ''
            
    clean_results = results[safe_cols].fillna('')
    # Apply our new bulletproof parser
    clean_results['ingredients'] = clean_results['ingredients'].apply(safe_parse_ingredients)
    
    results_json = clean_results.to_json(orient='records')
    return jsonify({"results": json.loads(results_json)})

@app.route('/api/plan', methods=['POST'])
def plan():
    data = request.json
    target_cal = data.get('calories', 2000)
    target_pro = data.get('protein', 120)
    num_meals = data.get('meals', 3)
    
    samples = [df.sample(2000, replace=True).reset_index(drop=True) for _ in range(num_meals)]
    
    combos = pd.DataFrame({
        'Total Calories': sum(s['calories'] for s in samples),
        'Total Protein': sum(s['protein'] for s in samples)
    })
    for i in range(num_meals):
        combos[f'Meal {i+1}'] = samples[i]['name']
        
    valid = combos[
        (combos['Total Calories'].between(target_cal - 150, target_cal + 150)) &
        (combos['Total Protein'].between(target_pro - 15, target_pro + 15))
    ].copy()
    
    if valid.empty:
        return jsonify({"results": [], "message": "No combinations found."})
        
    valid['Error'] = abs(valid['Total Calories'] - target_cal) + (abs(valid['Total Protein'] - target_pro) * 10)
    best_combos = valid.sort_values('Error').head(5).drop(columns=['Error'])
    
    return jsonify({"results": json.loads(best_combos.to_json(orient='records'))})

if __name__ == '__main__':
    app.run(debug=True, port=5000)