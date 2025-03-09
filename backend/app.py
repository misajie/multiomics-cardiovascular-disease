from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import pickle
import os
from lifelines import CoxPHFitter
from lifelines.utils import concordance_index

app = Flask(__name__)
CORS(app)
# Load data
mean_var_df = pd.read_csv('dataset/mean_var_df.csv')
omics_percentiles = pd.read_csv('dataset/percentiles.csv')
townsend_percentiles = pd.read_csv('dataset/townsend_percentiles.csv')
mock_data = pd.read_csv('dataset/cindex_website.tsv', sep='\t').to_dict(orient='records')

# Load models
model_dir = 'models'
models = {}
for model_name in ['cph_aaa', 'cph_af', 'cph_cad', 'cph_cvd_death', 'cph_hf', 'cph_pad', 'cph_stroke', 'cph_va', 'cph_vt']:
    with open(os.path.join(model_dir, f'{model_name}.pkl'), 'rb') as f:
        models[model_name] = pickle.load(f)

def standardize_continuous_variables(user_values, mean_var_df):
    standardized_values = {}
    for variable in ['age', 'sbp', 'dbp', 'height', 'weight', 'waist_cir', 'waist_hip_ratio', 'bmi', 'baso', 'eos', 'hct', 'hb', 'lc', 'mc', 'nc', 'plt', 'wbc']:
        mean = mean_var_df.loc[mean_var_df['variables'] == variable, 'mean'].values[0]
        var = mean_var_df.loc[mean_var_df['variables'] == variable, 'var'].values[0]
        standardized_values[variable] = (user_values.get(variable, 0) - mean) / np.sqrt(var)
    return standardized_values

def one_hot_encode_categorical_variables(user_values):
    sex_encoded = {'male_1.0': 1 if user_values.get('sex', 'female') == 'male' else 0}
    ethnicity_encoded = {'ethnicity_1.0': 0, 'ethnicity_2.0': 0, 'ethnicity_3.0': 0}
    if user_values.get('ethnicity', 'white') == 'asian':
        ethnicity_encoded['ethnicity_2.0'] = 1
    elif user_values.get('ethnicity', 'white') == 'black':
        ethnicity_encoded['ethnicity_3.0'] = 1
    elif user_values.get('ethnicity', 'white') == 'others':
        ethnicity_encoded['ethnicity_1.0'] = 1
    health_variables = ['current_smoking', 'daily_drinking', 'healthy_sleep', 'physical_act', 'healthy_diet', 'social_active', 'family_heart_hist', 'family_stroke_hist', 'family_hypt_hist', 'family_diab_hist', 'diab_hist', 'hypt_hist', 'lipidlower', 'antihypt']
    health_encoded = {}
    for var in health_variables:
        health_encoded[f'{var}_1.0'] = 1 if user_values.get(var, 'no') == 'yes' else 0
    return {**sex_encoded, **ethnicity_encoded, **health_encoded}

def process_user_input(user_values, mean_var_df):
    standardized_values = standardize_continuous_variables(user_values, mean_var_df)
    categorical_encoded = one_hot_encode_categorical_variables(user_values)
    # 直接使用用户输入的 prs, metscore, proscore, townsend 值
    final_values = {
        **standardized_values,
        **categorical_encoded,
        'prs': user_values.get('prs', 0),
        'metscore': user_values.get('metscore', 0),
        'proscore': user_values.get('proscore', 0),
        'townsend': user_values.get('townsend', 0)
    }
    final_df = pd.DataFrame([final_values])
    return final_df

@app.route('/api/calculate-risk', methods=['POST'])
def calculate_risk():
    data = request.json
    user_values = data['data']
    outcome = data['disease']
    final_user_input_df = process_user_input(user_values, mean_var_df)
    model = models[f'cph_{outcome}']
    disease_prob = 1 - model.predict_survival_function(final_user_input_df, times=10).values.flatten()
    return jsonify({'risk': float(disease_prob[0])})

@app.route('/api/get-mock-data', methods=['GET'])
def get_mock_data():
    return jsonify(mock_data)

@app.route('/api/get-percentile-mappings', methods=['POST'])
def get_percentile_mappings():
    data = request.json
    outcome = data['outcome']
    mappings = {
        'prs': [],
        'metscore': [],
        'proscore': [],
        'townsend': []
    }
    
    for omics_type in ['prs', 'metscore', 'proscore']:
        relevant_percentiles = omics_percentiles[(omics_percentiles['outcome'] == outcome) & (omics_percentiles['omics'] == omics_type)]
        bin_centers = relevant_percentiles.iloc[0, 2:].values
        mappings[omics_type] = [float(x) for x in bin_centers]
    
    bin_centers = townsend_percentiles.iloc[0, 2:].values
    mappings['townsend'] = [float(x) for x in bin_centers]
    
    return jsonify(mappings)

if __name__ == '__main__':
    app.run('0.0.0.0',debug=True)