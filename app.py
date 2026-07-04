import streamlit as st
import pandas as pd
import numpy as np
import pickle
from sklearn.metrics.pairwise import cosine_similarity
import ast

st.set_page_config(page_title="MealFinder", layout="wide")

st.title("MealFinder 🍽️")
st.write("Find exactly what you are craving, within your macros.")

@st.cache_data
def load_data():
    return pd.read_pickle('data/cleaned_recipes.pkl')

@st.cache_resource
def load_models():
    with open('data/vectorizer.pkl', 'rb') as f:
        vec = pickle.load(f)
    with open('data/tfidf_matrix.pkl', 'rb') as f:
        matrix = pickle.load(f)
    return vec, matrix

df = load_data()
vectorizer, tfidf_matrix = load_models()

# --- SEARCH ENGINE LOGIC ---
def search_recipes(query, tags_filter, top_n=10):
    if tags_filter:
        query = query + ' ' + ' '.join(tags_filter)

    query_vec = vectorizer.transform([query])
    similarity_scores = tfidf_matrix.dot(query_vec.T).toarray().flatten()
    
    if np.max(similarity_scores) == 0:
        return pd.DataFrame() 
        
    top_indices_unordered = np.argpartition(similarity_scores, -top_n)[-top_n:]
    top_indices_sorted = top_indices_unordered[np.argsort(similarity_scores[top_indices_unordered])[::-1]]
    
    return df.iloc[top_indices_sorted].copy()

# --- NEW: SIMILAR DISHES LOGIC ---
def get_similar_recipes(recipe_index, top_n=5):
    # Grab the exact mathematical vector for the clicked recipe
    target_vec = tfidf_matrix[recipe_index]
    
    # Calculate how similar it is to every other recipe
    similarity_scores = tfidf_matrix.dot(target_vec.T).toarray().flatten()
    
    # Grab one extra result (top_n + 1) because the #1 closest match will always be the recipe itself!
    top_indices_unordered = np.argpartition(similarity_scores, -(top_n + 1))[-(top_n + 1):]
    top_indices_sorted = top_indices_unordered[np.argsort(similarity_scores[top_indices_unordered])[::-1]]
    
    # Remove the recipe itself from the results array
    top_indices_sorted = top_indices_sorted[top_indices_sorted != recipe_index][:top_n]
    
    return df.iloc[top_indices_sorted][['name', 'calories', 'protein', 'minutes']]

# --- DYNAMIC COMBO PLANNER LOGIC ---
def generate_dynamic_combo(target_cal, target_pro, num_meals, cal_tol=150, pro_tol=15):
    simulations = 2000
    samples = [df.sample(simulations, replace=True).reset_index(drop=True) for _ in range(num_meals)]
    
    total_cals = sum(sample['calories'] for sample in samples)
    total_pro = sum(sample['protein'] for sample in samples)
    
    combos = pd.DataFrame({'Total Calories': total_cals, 'Total Protein': total_pro})
    for i in range(num_meals):
        combos[f'Meal {i+1}'] = samples[i]['name']
        
    valid = combos[
        (combos['Total Calories'] >= target_cal - cal_tol) &
        (combos['Total Calories'] <= target_cal + cal_tol) &
        (combos['Total Protein'] >= target_pro - pro_tol) &
        (combos['Total Protein'] <= target_pro + pro_tol)
    ].copy()
    
    if valid.empty:
        return None
        
    valid['Error'] = abs(valid['Total Calories'] - target_cal) + (abs(valid['Total Protein'] - target_pro) * 10)
    return valid.sort_values('Error').head(5).drop(columns=['Error'])

# --- UI LAYOUT ---
tab1, tab2 = st.tabs(["Search Cravings", "Plan Meals"])

# TAB 1: CRAVING SEARCH
with tab1:
    col1, col2 = st.columns([3, 2])
    with col1:
        user_query = st.text_input("What are you craving?", placeholder="e.g., spicy asian noodles")
    with col2:
        available_tags = [
        'vegetarian', 'vegan', 'gluten-free', 'low-carb', 'high-protein', 'dairy-free',
        'spicy', 'sweet', 'savory', 'breakfast', 'lunch', 'dinner', 'snack', 'dessert',
        'chicken', 'beef', 'seafood', 'fish', 'egg', 'cheese', 'paneer', 'rice', 'noodles', 'pasta', 
        'pizza', 'burger', 'salad', 'soup', 'curry', 'sandwich', 'wrap', 'cake',
        'asian', 'indian', 'italian', 'mexican', 'chinese', 'american', 'mediterranean', 'thai', 'french']
        selected_tags = st.pills("Filter by tags", available_tags, selection_mode='multi')

    if user_query or selected_tags:
        query_to_search = user_query if user_query else ""
        results = search_recipes(query_to_search, selected_tags)
        
        if results.empty:
            st.warning("No matches found.")
        else:
            st.write("💡 **Tip:** Click any column header to sort. Click the left edge of a row to reveal the recipe!")
            
            display_df = results[['name', 'calories', 'protein', 'minutes', 'description']]

            selection_event = st.dataframe(
                display_df,
                use_container_width=True,
                on_select="rerun",
                selection_mode="single-row"
            )

            if len(selection_event.selection.rows) > 0:
                clicked_row_index = selection_event.selection.rows[0]
                selected_recipe = results.iloc[clicked_row_index]
                
                # --- RECIPE DISPLAY ---
                st.markdown("---")
                st.subheader(f"📖 {selected_recipe['name'].title()}")
                
                recipe_col1, recipe_col2 = st.columns([1,2])
                with recipe_col1:
                    st.write("**Ingredients:**")
                    for item in selected_recipe['ingredients']:
                        st.write(f"- {item}")
                        
                with recipe_col2:
                    st.write("**Instructions:**")
                    try:
                        steps_list = ast.literal_eval(selected_recipe['steps'])
                        for i, step in enumerate(steps_list):
                            st.write(f"{i+1}. {step.capitalize()}")
                    except:
                        st.write(selected_recipe['steps'])
                
                # --- NEW: SIMILAR DISHES DISPLAY ---
                st.markdown("---")
                st.subheader("🤖 Similar Dishes You Might Like")
                
                # We use selected_recipe.name to grab the true original Pandas index of the row
                original_df_index = selected_recipe.name 
                similar_results = get_similar_recipes(original_df_index)
                
                st.dataframe(similar_results, use_container_width=True)

# TAB 2: MEAL PLANNER
with tab2:
    with st.form("planner_form"):
        colA, colB, colC = st.columns(3)
        with colA:
            t_cal = st.number_input("Target Calories", min_value=500, max_value=5000, value=2000, step=50)
        with colB:
            t_pro = st.number_input("Target Protein (g)", min_value=10, max_value=300, value=120, step=5)
        with colC:
            n_meals = st.number_input("Number of Meals", min_value=1, max_value=6, value=3)
            
        submit = st.form_submit_button("Generate Plan")
        
    if submit:
        st.subheader(f"Optimal {n_meals}-Meal Combos")
        combo_results = generate_dynamic_combo(t_cal, t_pro, n_meals)
        
        if combo_results is not None:
            st.dataframe(combo_results, use_container_width=True)
        else:
            st.warning("No combinations found in that exact range. Try adjusting your targets.")