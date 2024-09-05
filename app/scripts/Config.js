const Config = {
  review: {
    groupName: 'AnnotatorGPT',
    namespace: 'review',
    urlParamName: 'rag',
    defaultLLM: 'anthropic',
    tags: { // Defined tags for the domain
      grouped: { // Grouped annotations
        group: 'criteria',
        subgroup: 'level',
        relation: 'isCriteriaOf'
      }
    }
  },
  prompts: {
    correctPrompt:
    'Exercise: [C_NAME]\n' + 'Exercise description: [C_DESCRIPTION]\n' + 'Solution provided : [C_SOLUTION]\n' +
    'Based on the above, please analyze the full XML exercise and generate a JSON response (Do not consider the abstract).\n ' +
    'The JSON should list every wrong XML answers, but not from paper\'s abstract.\n' +
    'If all is correct, create an empty json.\n' +
    'To correct an xml, first check if the root of the xml is set correctly (xmlns, schemalocation and etc.). Then you check the elements inside . \n' +
    'If the solution has an answer that does not appear in the document, the variable "text" must contain the place where the solution should appear.\n' +
    'Compare with the solution provided and description, then indicate where it is wrong and why. You do not have to include solutions that do not come from the solution provided. Save you  response in these variables (text, explanation). The excerpts should come to the point and be quite brief, so be thrifty. The format should be as follows:\n' +
    '{\n' +
    '"name": "[Exercise Name,]",\n' +
    '"excerpts": [\n' +
    '{\n' +
    '"text": "[Write here the part of the document(DOM) that is wrong, according to the solution (at most 25 words))]",\n' +
    '"explanation": "[Explains how to correct it]"\n' +
    '},\n' +
    '{\n' +
    '"text": "[Write here the part of the document(DOM) that is wrong, according to the solution (at most 25 words))]",\n' +
    '"explanation": "[Explains how to correct it]"\n' +
    '} ...(could be more)\n' +
    ']\n' +
    '}\n' +
    '.\n' +
    'When using this prompt, replace the placeholders with the current content of the excercise and the specific description and solution.\n',
    solvePrompt:
    'Exercise: [C_Name]\n' + 'Exercise description: [C_DESCRIPTION]\n' +
    'Based on the above, please solve the full exercise and generate a JSON response (Do not consider the abstract). The JSON should contain the solution of the exercise, but not from paper\'s abstract, i need  only the solution, its no neccesary explanation. The excerpts should come to the point and be quite brief, so be thrifty. The format should be as follows:\n' +
    '{\n' +
    '"name": "[Exercise Name]",\n' +
    '"solutions": "[solutions of the exercise, with their statement]"' +
    '}\n' +
    'When using this prompt, replace the placeholders with the current content of the excercise and the specific description.\n' +
    'Don\'t add more square bracket.\n',
    importPrompt:
    'Transforms the exercises in the document(html) into a Json (Do not consider the abstract). The JSON should list every exercise, but not from paper\'s abstract. The format should be as follows:\n' +
    '{\n' +
    '"criteria": [' +
    '{\n' +
    '"name": "[Exercise name, more than 3 characters]",' +
    '"group": "[Category or statement of exercise]",' +
    '"description": "[content of the exercise as is]",' +
    '"solution": "[The full solution of the exercise, in case you have, if not, put empty]",' +
    '"levels": [],' +
    '"custom": true' +
    '},\n' +
    '{\n' +
    '"name": "[Exercise name, more than 3 characters]",' +
    '"group": "[Category or statement of exercise]",' +
    '"description": "[content of the exercise as is ]",' +
    '"solution": "[The full solution of the exercise, in case you have, if not, put empty]",' +
    '"levels": [],' +
    '"custom": true' +
    '}...\n' +
    ']\n' +
    '"defaultLevels": [' +
    '{\n' +
    '"name": "Strength",' +
    '"description": ""' +
    '}, \n' +
    '{\n' +
    '"name": "Minor weakness",' +
    '"description": ""' +
    '}, \n' +
    '{\n' +
    '"name": "Major weakness",' +
    '"description": ""' +
    '} \n' +
    ']\n' +
    '}\n' +
    'Don\'t touch defaultLevels, only add the exercises in the criteria array.\n' +
    'When using this prompt, replace the placeholders with the current content of the excercise and the specific description.\n' +
    'Don\'t add more square bracket.\n' +
    'The solutions to the exercises are below,copy the whole solution and put it in json .\n',
    compilePrompt: 'Research Paper Context: [The research paper is provided above]\n' +
      'Criterion for Evaluation: [C_NAME]\n' +
      'Criterion Description: [C_DESCRIPTION]\n' +
      'Paragraphs: [C_EXCERPTS]\n' +
      'Based on the above, you have to act as an academic reviewer and assess. For the criterion, you have to assess if it is met considering these possible results:' + ' Met, Partially met, or Not met. Then, you have to explain why it is met or not met. Base your opinion mainly in the above paragraphs. The JSON format should be as follows:\n' +
      '{\n' +
      '"name": "[Criterion Name]",\n' +
      '"sentiment": "[Met/Partially met/Not met]",\n' +
      '"comment": "[the reason of the results, if you mention one of the paragraphs in your comment reference the full paragraphs instead of the paragraph number]",\n' +
      '}\n' +
      'When using this prompt, replace the placeholders with the actual content of the research paper and the specific criterion details.\n',
    alternativePrompt: 'Research Paper Context: [The research paper is provided above]\n' +
      'Criterion for Evaluation: [C_NAME]\n' +
      'Criterion Description: [C_DESCRIPTION]\n' +
      'Paragraphs: [C_EXCERPTS]\n' +
      'You have to act as an academic reviewer and generate multiple alternative view points for the asessed criterion (Positive Viewpoint, Critical Viewpoint, Constructive Viewpoint, Alternative Viewpoint). Base on the above and base your opinion mainly in the above Paragraphs to analyze the full research paper and generate a JSON response. The JSON format should be as follows:\n' +
      '{\n' +
      '"name": "[Criterion Name]",\n' +
      '"answer": [provide different viewpoints in different bullet points using dashes (all in a single string), you have to put a "</br>" before each dash like "</br>-". You have to mark the different view point with bold xml tags (<b>). All the content must be specified in the answer key, without creating keys inside, if you mention one of the paragraphs in your answer reference the full paragraphs instead of the paragraph number)],\n' +
      '}\n' +
      'When using this prompt, replace the placeholders with the actual content of the research paper and the specific criterion details.\n',
    factCheckingPrompt: 'Fack check the following text <text>[C_EXCERPT]</text>.' +
      ' You have to provide the response in JSON format with' +
      ' the following key: -"answer" (the answer to the question. all the content must be specified in the answer key, without creating keys inside),',
    socialJudgePrompt: 'Is it socially appropriate to say the following text? <text>[C_EXCERPT]<text> as important.' +
      ' You have to provide the response in JSON format with' +
      ' the following keys: -"name" (contains the criteria name), -"answer" (the answer to the question. all the content must be specified in the answer key, without creating keys inside),',
    clarifyPrompt: 'Based on your last saved answer: [C_COMMENT], from exercise: [C_NAME] and your considered the text excerpt found in triple quoted text <criterion>[C_EXCERPT]</criterion> as important. Therefore, now I would like to ask you [C_QUESTION]?' +
      ' You have to provide the response only in JSON format with a single key, which is answer' +
      ' the following keys: -"answer" (the answer to the question. all the content must be specified in the answer key, without creating keys inside),' +
      ' do not add more text to your answer apart from the json with the answer in the "answer key"'
  }
}

export default Config
