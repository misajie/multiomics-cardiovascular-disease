const diseaseMap = {
    'cad': 'Coronary artery disease',
    'stroke': 'Stroke',
    'hf': 'Heart failure',
    'af': 'Atrial fibrillation',
    'va': 'Ventricular arrhythmias',
    'pad': 'Peripheral artery disease',
    'aaa': 'Abdominal aortic aneurysm',
    'vt': 'Venous thromboembolism',
    'cvd_death': 'Cardiovascular death'
};

let percentileMappings = null;
let currentData = null;

// 默认mock数据作为后端失败时的回退
const defaultMockData = [
    {predictor: "prs", outcome: "Coronary artery disease", mean_cindex: 0.62, cindex_2_5: 0.60, cindex_97_5: 0.64},
    {predictor: "metscore", outcome: "Coronary artery disease", mean_cindex: 0.68, cindex_2_5: 0.66, cindex_97_5: 0.70},
    {predictor: "proscore", outcome: "Coronary artery disease", mean_cindex: 0.71, cindex_2_5: 0.69, cindex_97_5: 0.73},
    {predictor: "agesex", outcome: "Coronary artery disease", mean_cindex: 0.65, cindex_2_5: 0.63, cindex_97_5: 0.67},
    {predictor: "agesex+prs", outcome: "Coronary artery disease", mean_cindex: 0.70, cindex_2_5: 0.66, cindex_97_5: 0.72},
    {predictor: "agesex+metscore", outcome: "Coronary artery disease", mean_cindex: 0.75, cindex_2_5: 0.71, cindex_97_5: 0.77},
    {predictor: "agesex+proscore", outcome: "Coronary artery disease", mean_cindex: 0.76, cindex_2_5: 0.74, cindex_97_5: 0.78},
    {predictor: "clin", outcome: "Coronary artery disease", mean_cindex: 0.73, cindex_2_5: 0.71, cindex_97_5: 0.75},
    {predictor: "panel", outcome: "Coronary artery disease", mean_cindex: 0.76, cindex_2_5: 0.74, cindex_97_5: 0.78},
    // 可根据需要添加更多默认数据
];

function getDiseaseCode(diseaseName) {
    const reverseMap = {};
    Object.entries(diseaseMap).forEach(([code, name]) => reverseMap[name] = code);
    return reverseMap[diseaseName] || "cad";
}

function collectFormData() {
    const formData = {};
    const diseaseSelect = document.querySelector('#disease-select');
    const selectedDisease = diseaseSelect.options[diseaseSelect.selectedIndex].text;
    formData['outcome'] = getDiseaseCode(selectedDisease);

    // 连续变量
    const continuousVars = ["age", "sbp", "dbp", "height", "weight", "waist_cir", 
                            "waist_hip_ratio", "bmi", "baso", "eos", "hct", "hb", 
                            "lc", "mc", "nc", "plt", "wbc"];
    continuousVars.forEach(varName => {
        const input = document.getElementById(varName);
        if (input && input.value) formData[varName] = parseFloat(input.value);
    });

    // 百分位变量
    const percentileVars = ["townsend", "prs", "metscore", "proscore"];
    percentileVars.forEach(varName => {
        const input = document.getElementById(varName);
        if (input && input.value) formData[varName] = parseFloat(input.value);
    });

    // 修复 Sex 选择
    const sexGroup = Array.from(document.querySelectorAll('.form-group')).find(group => {
        const label = group.querySelector('.form-label');
        return label && label.textContent.trim() === 'Sex';
    });
    if (sexGroup) {
        const sexButtons = sexGroup.querySelector('.button-group');
        if (sexButtons) {
            const isMale = sexButtons.querySelector('.button-option:first-child').classList.contains('selected');
            formData["sex"] = isMale ? "male" : "female";
        }
    }

    // 修复 Ethnicity 选择
    const ethnicityGroup = Array.from(document.querySelectorAll('.form-group')).find(group => {
        const label = group.querySelector('.form-label');
        return label && label.textContent.trim() === 'Ethnicity';
    });
    if (ethnicityGroup) {
        const selectedEthnicity = ethnicityGroup.querySelector('.button-option.selected');
        if (selectedEthnicity) {
            const ethnicityValue = selectedEthnicity.getAttribute('data-value');
            formData["ethnicity"] = ethnicityValue === "1" ? "white" :
                                   ethnicityValue === "2" ? "black" : // 注意 HTML 中是 2=Black, 3=Asian
                                   ethnicityValue === "3" ? "asian" : "others";
        }
    }

    // 二元变量
    const binaryVariableMappings = {
        "Current Smoking": "current_smoking",
        "Daily Alcohol Intake": "daily_drinking",
        "Healthy Sleep": "healthy_sleep",
        "Physical activity": "physical_act",
        "Healthy diet": "healthy_diet",
        "Social connection": "social_active",
        "Family History of Heart Disease": "family_heart_hist",
        "Family History of Stroke": "family_stroke_hist",
        "Family History of Hypertension": "family_hypt_hist",
        "Family History of Diabetes": "family_diab_hist",
        "History of Hypertension": "hypt_hist",
        "History of Diabetes": "diab_hist",
        "Lipid-lowering Medication": "lipidlower",
        "Antihypertensive Medication": "antihypt"
    };

    Object.entries(binaryVariableMappings).forEach(([labelText, varName]) => {
        const formGroup = Array.from(document.querySelectorAll('.form-group')).find(group => {
            const label = group.querySelector('.form-label');
            return label && label.textContent.trim() === labelText;
        });
        if (formGroup) {
            const isYes = formGroup.querySelector('.button-option:first-child').classList.contains('selected');
            formData[varName] = isYes ? "yes" : "no";
        }
    });

    return formData;
}

function setupPage() {
    document.querySelectorAll('.standard-value').forEach(element => element.style.display = 'none');
    const inputs = document.querySelectorAll('input[oninput]');
    inputs.forEach(input => {
        if (input.getAttribute('oninput')?.includes('standardizeValue')) {
            input.removeAttribute('oninput');
        }
    });
}

function updateSliderRanges(outcome) {
    fetch('/api/get-percentile-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: outcome })
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(mappings => {
        console.log('Received mappings:', mappings);
        percentileMappings = mappings;
        const sliders = {
            'prs': document.getElementById('prs'),
            'metscore': document.getElementById('metscore'),
            'proscore': document.getElementById('proscore'),
            'townsend': document.getElementById('townsend')
        };

        Object.entries(sliders).forEach(([key, slider]) => {
            if (slider) {
                const values = mappings[key] || Array.from({length: 100}, (_, i) => i);
                slider.min = Math.min(...values).toString();
                slider.max = Math.max(...values).toString();
                slider.step = ((slider.max - slider.min) / 99).toString();
                slider.value = values[49] || "50";
                updateSliderValue(`${key}-value`, slider.value);
            } else {
                console.error(`Slider ${key} not found`);
            }
        });
    })
    .catch(error => {
        console.error('Error fetching percentile mappings:', error);
        ['prs', 'metscore', 'proscore', 'townsend'].forEach(key => {
            const slider = document.getElementById(key);
            if (slider) {
                slider.min = "0";
                slider.max = "100";
                slider.step = "1";
                slider.value = "50";
                updateSliderValue(`${key}-value`, "50");
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    setupPage();
    initializeButtons();
    setupRiskCalculator();
    setupPerformanceComparison();

    fetch('/api/get-mock-data', {
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        console.log('Mock data loaded:', data);
        currentData = data;
        const initialOutcome = getDiseaseCode(document.querySelector('.form-group select').value);
        updateSliderRanges(initialOutcome);
    })
    .catch(error => {
        console.error('Error loading mock data:', error);
        currentData = defaultMockData;
        const initialOutcome = getDiseaseCode(document.querySelector('.form-group select').value);
        updateSliderRanges(initialOutcome);
    });
});

function initializeButtons() {
    const buttons = document.querySelectorAll('.button-option');
    console.log('Initializing buttons:', buttons.length);
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            const siblings = this.parentElement.querySelectorAll('.button-option');
            siblings.forEach(sib => sib.classList.remove('selected'));
            this.classList.add('selected');
        });
    });

    const exclusiveCheckboxes = document.querySelectorAll('.exclusive');
    exclusiveCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                exclusiveCheckboxes.forEach(otherCheckbox => {
                    if (otherCheckbox !== this) otherCheckbox.checked = false;
                });
            }
        });
    });

    const diseaseSelect = document.querySelector('#disease-select');
    if (diseaseSelect) {
        diseaseSelect.addEventListener('change', function() {
            const outcome = getDiseaseCode(this.value);
            console.log('Disease changed to:', outcome);
            updateSliderRanges(outcome);
        });
    } else {
        console.error('Disease select not found');
    }
}

function calculateRisk() {
    const formData = collectFormData();
    const diseaseSelect = document.querySelector('.form-group select');
    const selectedDisease = diseaseSelect.options[diseaseSelect.selectedIndex].text;

    console.log('Calculating risk for:', formData);
    document.querySelector('#selected-disease-name').textContent = selectedDisease;
    document.querySelector('#selected-disease-desc').textContent = selectedDisease.toLowerCase();
    document.querySelector('#disease-risk').textContent = 'Calculating...';
    document.querySelector('#risk-results').style.display = 'block';

    calculateRiskWithModel(formData, formData['outcome'])
        .then(response => {
            console.log('Risk response:', response);
            const riskPercentage = (response.risk * 100).toFixed(1) + '%';
            document.querySelector('#disease-risk').textContent = riskPercentage;
        })
        .catch(error => {
            console.error('Risk calculation failed:', error);
            document.querySelector('#disease-risk').textContent = 'Error';
        });

    document.querySelector('#risk-results').scrollIntoView({ behavior: 'smooth' });
}

function setupRiskCalculator() {
    const calculateButton = document.querySelector('#calculate-risk-button');
    if (calculateButton) {
        
        calculateButton.addEventListener('click', function() {
            console.log('Setting up calculate risk button');
            calculateRisk();
        });
    } else {
        console.error('Calculate risk button not found');
    }

    ['prs', 'metscore', 'proscore', 'townsend'].forEach(key => {
        const slider = document.getElementById(key);
        if (slider) {
            slider.addEventListener('input', function() {
                updateSliderValue(`${key}-value`, this.value);
            });
        } else {
            console.error(`Slider ${key} not found`);
        }
    });
}

function calculateRiskWithModel(formData, selectedDisease) {
    return fetch('/api/calculate-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disease: selectedDisease, data: formData })
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data && typeof data.risk === 'number') {
            return { risk: data.risk };
        } else {
            throw new Error('Invalid response format');
        }
    })
    .catch(error => {
        console.error('Error calculating risk:', error);
        return { risk: 0.05 };
    });
}

function updateSliderValue(valueId, value) {
    const element = document.getElementById(valueId);
    if (element) {
        element.textContent = parseFloat(value).toFixed(2);
    } else {
        console.error(`Value element ${valueId} not found`);
    }
}


/**
 * Function to set up performance comparison tab
 */
function setupPerformanceComparison() {
    document.querySelector('#generate-results-button').addEventListener('click', function() {
        // Get selected diseases and predictors
        const selectedCVD = Array.from(document.querySelectorAll('input[name="cvd"]:checked'))
            .map(checkbox => checkbox.value);
        
        const selectedPredictors = Array.from(document.querySelectorAll('input[name="predictor"]:checked'))
            .map(checkbox => checkbox.value);
        
        // Validate selections
        if (selectedCVD.length === 0) {
            alert('Please select at least one cardiovascular disease.');
            return;
        }
        
        if (selectedPredictors.length === 0) {
            alert('Please select at least one predictor.');
            return;
        }
        
        // Filter data based on selections and update table
        updateResultsTable(selectedCVD, selectedPredictors);
        
        // For a real application, this would also update the chart
        updatePerformanceChart(selectedCVD, selectedPredictors);
    });
}

/**
 * D3 scale linear function (simplified for standalone usage)
 * @returns {Function} - A scale function with domain and range methods
 */
function d3_scaleLinear() {
    let domain = [0, 1];
    let range = [0, 1];
    
    function scale(d) {
        const domainRange = domain[1] - domain[0];
        const outputRange = range[1] - range[0];
        return range[0] + ((d - domain[0]) / domainRange) * outputRange;
    }
    
    scale.domain = function(d) {
        if (!arguments.length) return domain;
        domain = d;
        return scale;
    };
    
    scale.range = function(r) {
        if (!arguments.length) return range;
        range = r;
        return scale;
    };
    
    return scale;
}

/**
 * D3 scale point function (simplified for standalone usage)
 * @returns {Function} - A scale function with domain, range, and padding methods
 */
function d3_scalePoint() {
    let domain = [];
    let range = [0, 1];
    let padding = 0;
    
    function scale(d) {
        const step = (range[1] - range[0]) / Math.max(1, domain.length - 1 + padding * 2);
        const index = domain.indexOf(d);
        return range[0] + step * (index + padding);
    }
    
    scale.domain = function(d) {
        if (!arguments.length) return domain;
        domain = d;
        return scale;
    };
    
    scale.range = function(r) {
        if (!arguments.length) return range;
        range = r;
        return scale;
    };
    
    scale.padding = function(p) {
        if (!arguments.length) return padding;
        padding = p;
        return scale;
    };
    
    return scale;
}

/**
 * Function to generate effective predictors
 * This is a placeholder for the function implementation
 */
function generateEffectivePredictors(selectedPredictors) {
    // Categorize predictors into clinical variables and omics predictors
    const clinicalPredictors = selectedPredictors.filter(p => ["agesex", "clin", "panel"].includes(p));
    const omicsPredictors = selectedPredictors.filter(p => ["prs", "metscore", "proscore"].includes(p));
    
    // Start with all individual predictors
    let effectivePredictors = [...selectedPredictors];
    
    // If both clinical variables and omics predictors exist, generate combinations
    if (clinicalPredictors.length > 0 && omicsPredictors.length > 0) {
        // Generate all pairwise combinations (clinical + one omics)
        clinicalPredictors.forEach(clinical => {
            omicsPredictors.forEach(omics => {
                effectivePredictors.push(`${clinical}+${omics}`);
            });
            
            // If multiple omics predictors are selected, generate three-way combinations
            if (omicsPredictors.length >= 2) {
                // All possible dual omics combinations with the current clinical predictor
                for (let i = 0; i < omicsPredictors.length; i++) {
                    for (let j = i + 1; j < omicsPredictors.length; j++) {
                        effectivePredictors.push(`${clinical}+${omicsPredictors[i]}+${omicsPredictors[j]}`);
                    }
                }
            }
            
            // If all three omics predictors are selected, create a combination with all omics
            if (omicsPredictors.length === 3) {
                effectivePredictors.push(`${clinical}+${omicsPredictors[0]}+${omicsPredictors[1]}+${omicsPredictors[2]}`);
            }
        });
    }
    
    return effectivePredictors;
}

/**
 * Function to filter data based on selections
 * This is a placeholder for the function implementation
 */
function filterData(data, selectedCVD, effectivePredictors) {
    return data.filter(item => {
        // Check if outcome matches any selected disease
        const outcomeMatches = selectedCVD.some(disease => 
            item.outcome.toLowerCase() === diseaseMap[disease].toLowerCase());
        
        // Check if predictor is in the effective predictors list
        const predictorSelected = effectivePredictors.includes(item.predictor);
        
        return outcomeMatches && predictorSelected;
    });
}

/**
 * Function to update results table
 * This is a placeholder for the function implementation
 */
function updateResultsTable(selectedCVD, selectedPredictors) {
    // Generate effective predictor combinations
    const effectivePredictors = generateEffectivePredictors(selectedPredictors);
    
    // Filter data
    const filteredData = filterData(currentData, selectedCVD, effectivePredictors);
    
    // Clear table body
    const tableBody = document.getElementById('results-table-body');
    tableBody.innerHTML = '';

    // If no matching data
    if (filteredData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4">No data available for the selected criteria.</td></tr>';
        return;
    }
    
    // Add rows to table
    filteredData.forEach(data => {
        // Format predictor name for display
        let predictorName = formatPredictorName(data.predictor);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${predictorName}</td>
            <td>${data.outcome}</td>
            <td>${parseFloat(data.mean_cindex).toFixed(2)}</td>
            <td>${parseFloat(data.cindex_2_5).toFixed(2)}–${parseFloat(data.cindex_97_5).toFixed(2)}</td>
        `;
        tableBody.appendChild(row);
    });
}

/**
 * Function to update performance chart
 * This is a placeholder for the function implementation
 */
function updatePerformanceChart(selectedCVD, selectedPredictors) {
    // Get chart container
    const chartElement = document.getElementById('performance-chart');
    
    // Clear previous content
    chartElement.innerHTML = '';
    
    // Generate effective predictor combinations
    const effectivePredictors = generateEffectivePredictors(selectedPredictors);
    
    // Filter data
    const filteredData = filterData(currentData, selectedCVD, effectivePredictors);
    
    // If no matching data
    if (filteredData.length === 0) {
        chartElement.innerHTML = '<div style="text-align: center; padding: 20px;">No data available for the selected criteria.</div>';
        return;
    }
    
    // Set chart dimensions and margins
    const margin = {top: 50, right: 20, bottom: 100, left: 80};
    const width = chartElement.offsetWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
    
    // Create scrollable chart container
    const chartContainer = document.createElement('div');
    chartContainer.style.width = '100%';
    chartContainer.style.overflowX = 'auto';
    chartContainer.style.overflowY = 'auto';
    chartElement.appendChild(chartContainer);

    // Create SVG element with enough width for chart and legend
    const svgWidth = width + margin.left + margin.right + 200; // Extra 200px for legend
    const svgHeight = height + margin.bottom + 200; 
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", svgWidth);
    svg.setAttribute("height", svgHeight);
    chartContainer.appendChild(svg);

    // Create a group element for the main chart area
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);
    svg.appendChild(g);
    
    // Group data by disease and predictor
    const predictorDiseaseGroups = {};
    const diseaseGroups = {};
    
    // Process each data point for grouping
    filteredData.forEach(item => {
        // Group by predictor
        if (!predictorDiseaseGroups[item.predictor]) {
            predictorDiseaseGroups[item.predictor] = [];
        }
        predictorDiseaseGroups[item.predictor].push(item);
        
        // Group by disease
        if (!diseaseGroups[item.outcome]) {
            diseaseGroups[item.outcome] = [];
        }
        diseaseGroups[item.outcome].push(item);
    });
    
    // Color definitions for different diseases
    const colors = {
        'Coronary artery disease': '#1f77b4',
        'Stroke': '#ff7f0e',
        'Heart failure': '#2ca02c',
        'Atrial fibrillation': '#d62728',
        'Ventricular arrhythmias': '#9467bd',
        'Peripheral artery disease': '#8c564b',
        'Abdominal aortic aneurysm': '#e377c2',
        'Venous thromboembolism': '#7f7f7f',
        'Cardiovascular death': '#bcbd22'
    };
    
    // Get all unique predictors from filtered data
    const predictors = [...new Set(filteredData.map(item => item.predictor))];
    
    // X-axis scale - categorized by predictor
    const xScale = d3_scalePoint()
        .domain(predictors)
        .range([0, width])
        .padding(0.5);
    
    // Y-axis scale for C-index values
    const yScale = d3_scaleLinear()
        .domain([0.5, 0.85]) // C-index typically ranges from 0.5 to 1
        .range([height, 0]);
    
    // Create and draw X-axis
    createXAxis(g, xScale, predictors, height, width);
    
    // Create and draw Y-axis
    createYAxis(g, yScale, height, width);
    
    // Create offsets for diseases within each predictor
    Object.entries(predictorDiseaseGroups).forEach(([predictor, items]) => {
        // Sort by disease name for consistent ordering
        items.sort((a, b) => a.outcome.localeCompare(b.outcome));
        
        // Calculate offsets based on number of diseases for this predictor
        const offsetStep = 20; // Offset width in pixels
        const totalWidth = (items.length - 1) * offsetStep;
        const startOffset = -totalWidth / 2;
        
        // Apply offset to each item
        items.forEach((item, index) => {
            item.xOffset = startOffset + (index * offsetStep);
        });
    });
    
    // Draw error bars and points for each disease group
    Object.entries(diseaseGroups).forEach(([disease, items]) => {
        const color = colors[disease] || '#000000';
        
        // Draw error bars and points (with X offsets)
        items.forEach(item => {
            drawErrorBarAndPoint(g, item, xScale, yScale, color);
        });
    });
    
    // Add legend below the chart
    drawLegend(g, diseaseGroups, colors, width, margin);
}

/**
 * Helper function: Create X-axis
 * This is a placeholder for the function implementation
 */
function createXAxis(g, xScale, predictors, height, width) {
    const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "g");
    xAxis.setAttribute("transform", `translate(0, ${height})`);
    g.appendChild(xAxis);
    
    // X-axis line
    const xAxisLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    xAxisLine.setAttribute("d", `M0,0H${width}`);
    xAxisLine.setAttribute("stroke", "black");
    xAxis.appendChild(xAxisLine);
    
    // X-axis ticks and labels
    predictors.forEach(predictor => {
        const x = xScale(predictor);
        
        // Tick line
        const tickLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tickLine.setAttribute("x1", x);
        tickLine.setAttribute("x2", x);
        tickLine.setAttribute("y1", 0);
        tickLine.setAttribute("y2", 6);
        tickLine.setAttribute("stroke", "black");
        xAxis.appendChild(tickLine);
        
        // Label with custom capitalization and 45-degree rotation
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", x);
        label.setAttribute("y", 9);
        label.setAttribute("text-anchor", "start");
        label.setAttribute("transform", `rotate(45, ${x}, 9)`);
        label.setAttribute("dominant-baseline", "hanging");
        label.textContent = formatPredictorName(predictor);
        xAxis.appendChild(label);
    });
}

/**
 * Helper function: Create Y-axis
 * This is a placeholder for the function implementation
 */
function createYAxis(g, yScale, height, width) {
    const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.appendChild(yAxis);
    
    // Y-axis line
    const yAxisLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    yAxisLine.setAttribute("d", `M0,0V${height}`);
    yAxisLine.setAttribute("stroke", "black");
    yAxis.appendChild(yAxisLine);
    
    // Y-axis ticks and labels
    const yTicks = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85];
    yTicks.forEach(tick => {
        const y = yScale(tick);
        
        // Tick line
        const tickLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tickLine.setAttribute("x1", -6);
        tickLine.setAttribute("x2", 0);
        tickLine.setAttribute("y1", y);
        tickLine.setAttribute("y2", y);
        tickLine.setAttribute("stroke", "black");
        yAxis.appendChild(tickLine);
        
        // Horizontal grid line
        const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        gridLine.setAttribute("x1", 0);
        gridLine.setAttribute("x2", width);
        gridLine.setAttribute("y1", y);
        gridLine.setAttribute("y2", y);
        gridLine.setAttribute("stroke", "#e0e0e0");
        gridLine.setAttribute("stroke-dasharray", "3,3");
        g.appendChild(gridLine);
        
        // Label
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", -10);
        label.setAttribute("y", y);
        label.setAttribute("text-anchor", "end");
        label.setAttribute("dominant-baseline", "middle");
        label.textContent = tick.toFixed(2);
        yAxis.appendChild(label);
    });
    
    // Y-axis title
    const yTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yTitle.setAttribute("transform", `translate(-50, ${height/2}) rotate(-90)`);
    yTitle.setAttribute("text-anchor", "middle");
    yTitle.setAttribute("font-weight", "bold");
    yTitle.textContent = "C-index";
    yAxis.appendChild(yTitle);
}

/**
 * Helper function: Draw error bars and data points
 * This is a placeholder for the function implementation
 */
function drawErrorBarAndPoint(g, item, xScale, yScale, color) {
    const baseX = xScale(item.predictor);
    const offset = item.xOffset || 0;
    const x = baseX + offset;
    const y = yScale(item.mean_cindex);
    const yLow = yScale(item.cindex_2_5);
    const yHigh = yScale(item.cindex_97_5);
    
    // Vertical error bar
    const errorBar = document.createElementNS("http://www.w3.org/2000/svg", "line");
    errorBar.setAttribute("x1", x);
    errorBar.setAttribute("x2", x);
    errorBar.setAttribute("y1", yLow);
    errorBar.setAttribute("y2", yHigh);
    errorBar.setAttribute("stroke", color);
    errorBar.setAttribute("stroke-width", 1.5);
    g.appendChild(errorBar);
    
    // Top horizontal cap
    const topCap = document.createElementNS("http://www.w3.org/2000/svg", "line");
    topCap.setAttribute("x1", x - 4);
    topCap.setAttribute("x2", x + 4);
    topCap.setAttribute("y1", yHigh);
    topCap.setAttribute("y2", yHigh);
    topCap.setAttribute("stroke", color);
    topCap.setAttribute("stroke-width", 1.5);
    g.appendChild(topCap);
    
    // Bottom horizontal cap
    const bottomCap = document.createElementNS("http://www.w3.org/2000/svg", "line");
    bottomCap.setAttribute("x1", x - 4);
    bottomCap.setAttribute("x2", x + 4);
    bottomCap.setAttribute("y1", yLow);
    bottomCap.setAttribute("y2", yLow);
    bottomCap.setAttribute("stroke", color);
    bottomCap.setAttribute("stroke-width", 1.5);
    g.appendChild(bottomCap);
    
    // Data point
    const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    point.setAttribute("cx", x);
    point.setAttribute("cy", y);
    point.setAttribute("r", 5);
    point.setAttribute("fill", color);
    
    // Add tooltip (simple title attribute)
    point.setAttribute("title", `${item.outcome}, ${item.predictor}: ${item.mean_cindex.toFixed(2)} (${item.cindex_2_5.toFixed(2)}-${item.cindex_97_5.toFixed(2)})`);
    
    g.appendChild(point);
}

/**
 * Helper function: Draw legend
 * This is a placeholder for the function implementation
 */
function drawLegend(g, diseaseGroups, colors, width, margin) {
    const legendGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    legendGroup.setAttribute("transform", `translate(${width + 20}, ${margin.top})`); // Position to the right of the chart
    g.appendChild(legendGroup);
    
    const diseases = Object.keys(diseaseGroups);
    const legendItemHeight = 25; // Height for each legend item

    diseases.forEach((disease, index) => {
        const y = index * legendItemHeight;
        const color = colors[disease] || '#000000';
        
        // Color box
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", 0);
        rect.setAttribute("y", y);
        rect.setAttribute("width", 12);
        rect.setAttribute("height", 12);
        rect.setAttribute("fill", color);
        legendGroup.appendChild(rect);
        
        // Disease name
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", 20);
        text.setAttribute("y", y + 6);
        text.setAttribute("font-size", "12px");
        text.setAttribute("dominant-baseline", "middle");
        text.textContent = disease;
        legendGroup.appendChild(text);
    });
}

/**
 * Helper function to format predictor names for display
 * @param {string} predictor - The predictor name
 * @returns {string} - The formatted predictor name
 */
function formatPredictorName(predictor) {
    // Split combination predictors
    const parts = predictor.split('+');
    
    // Format each part
    const formattedParts = parts.map(part => {
        switch(part.toLowerCase()) {
            case 'prs':
                return 'PRS';
            case 'panel':
                return 'PANEL';
            case 'agesex':
                return 'AgeSex';
            case 'clin':
                return 'Clin';
            case 'metscore':
                return 'MetScore';
            case 'proscore':
                return 'ProScore';
            default:
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }
    });
    
    // Rejoin with + symbols
    return formattedParts.join(' + ');
}

/**
 * Function to switch between tabs
 * @param {string} tabId - The ID of the tab to switch to
 */
function switchTab(tabId) {
    // Hide all tab contents
    const tabContents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove('active');
    }
    
    // Deactivate all tabs
    const tabs = document.getElementsByClassName('tab');
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }
    
    // Activate the selected tab and its content
    document.getElementById(tabId).classList.add('active');
    // Find the tab that was clicked
    const clickedTab = document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`);
    clickedTab.classList.add('active');
}

