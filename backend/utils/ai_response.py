from groq import Groq
import os

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

DISEASE_MAP = {
    "TURBERCULOSIS": "TUBERCULOSIS",
    "COVID19": "COVID-19"
}


def normalize_disease_name(disease):
    return DISEASE_MAP.get(disease, disease)


def generate_ai_response(disease):
    disease = normalize_disease_name(disease)

    if not client:
        return "AI Response unavailable because GROQ_API_KEY is not configured."

    if disease == "NORMAL":
        prompt = """
You are a medical assistant.

Start with this exact line:
"It is good to know that you did not have any disease and your chest X-ray is predicted as NORMAL."

Then provide precautions in the following STRICT structure.

Heading: Precautions for TUBERCULOSIS
Provide 5 bullet points.
Each bullet must be ONE sentence.
Each sentence must end with a full stop.

Heading: Precautions for COVID-19
Provide 5 bullet points.
Each bullet must be ONE sentence.
Each sentence must end with a full stop.

Heading: Precautions for PNEUMONIA
Provide 5 bullet points.
Each bullet must be ONE sentence.
Each sentence must end with a full stop.

Rules:
- Do NOT provide any disease summary.
- Do NOT mention symptoms.
- Do NOT mention diagnosis.
- Do NOT add extra blank lines.
- Do NOT use markdown symbols.
- Use clear, patient-friendly language.
"""
    else:
        prompt = f"""
You are a medical assistant.

The predicted disease is {disease}.

Respond STRICTLY in the following structure.

SECTION 1: SUMMARY
Write ONE single paragraph of about 15 sentences explaining {disease}.
Each sentence must end with a full stop.
Do NOT use bullet points here.

SECTION 2: COMMON SYMPTOMS
Provide bullet points.
Each bullet must be ONE sentence.
Each sentence must end with a full stop.

SECTION 3: PRECAUTIONS
Provide exactly 10 bullet points.
Each bullet must be ONE sentence.
Each sentence must end with a full stop.

SECTION 4: PREVENTION MEASURES
Provide exactly 10 bullet points.
Each bullet must be ONE sentence.
Each sentence must end with a full stop.

Rules:
- Do NOT skip any section.
- Do NOT merge sections.
- Do NOT add extra blank lines.
- Do NOT use markdown symbols.
- Use simple, patient-friendly medical language.
"""

    completion = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=900
    )

    return completion.choices[0].message.content.strip()
