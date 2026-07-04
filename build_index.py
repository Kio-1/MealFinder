import pandas as pd
import pickle
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.feature_extraction.text import CountVectorizer

print('Loading cleaned data...')
df = pd.read_pickle('data/cleaned_recipes.pkl')

# ==========================================
# NEW: ML NAIVE BAYES TAGGING LOGIC
# ==========================================
print('Training Naive Bayes Classifier to predict missing tags...')

# 1. Define the categories we want our ML to learn
target_cuisines = ['asian', 'mexican', 'italian', 'indian', 'french']

def extract_target_cuisine(tags_list):
    for cuisine in target_cuisines:
        if cuisine in tags_list:
            return cuisine
    return 'unknown'

# 2. Find out which recipes already have these tags, and which are unknown
df['ml_cuisine'] = df['tags'].apply(extract_target_cuisine)

train_data = df[df['ml_cuisine'] != 'unknown']
predict_data = df[df['ml_cuisine'] == 'unknown']

# 3. Convert ingredients into a simple word-count matrix for the Naive Bayes model
cv = CountVectorizer()
X_train = cv.fit_transform(train_data['ingredients'].apply(lambda x: ' '.join(x)))
y_train = train_data['ml_cuisine']

# 4. Train the Model
nb_classifier = MultinomialNB()
nb_classifier.fit(X_train, y_train)

# 5. Predict the cuisines for the 'unknown' recipes
X_predict = cv.transform(predict_data['ingredients'].apply(lambda x: ' '.join(x)))
predictions = nb_classifier.predict(X_predict)

# 6. Inject the predicted tags back into the main dataframe
df.loc[df['ml_cuisine'] == 'unknown', 'ml_cuisine'] = predictions

# 7. Add the newly predicted tag into the official 'tags' list so the Search Engine can see it
df['tags'] = df.apply(lambda row: row['tags'] + [row['ml_cuisine']], axis=1)

print('ML Tagging Complete! Unscored recipes have been automatically categorized.')

# ==========================================
# ORIGINAL INDEX BUILDING LOGIC
# ==========================================
print('Preparing search text...')

# The new ML tags are automatically included here because we appended them to df['tags']
df['search_text'] = (
    df['name'] + ' ' + 
    df['tags'].apply(lambda x: ' '.join(x)) + ' ' + 
    df['ingredients'].apply(lambda x: ' '.join(x)) + ' ' +
    df['minutes'].astype(str) + ' ' +
    df['description']
)

print('Building the TF-IDF index (this will take a minute)...')
vectorizer = TfidfVectorizer(stop_words='english')
tfidf_matrix = vectorizer.fit_transform(df['search_text'])

print('Saving the vectorizer and matrix to disk...')
with open('data/vectorizer.pkl', 'wb') as f:
    pickle.dump(vectorizer, f)
with open('data/tfidf_matrix.pkl', 'wb') as f:
    pickle.dump(tfidf_matrix, f)

print('Index built successfully!')