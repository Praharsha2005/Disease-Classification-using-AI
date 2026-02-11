from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import tensorflow as tf
import numpy as np
import json
import base64
import cv2
from datetime import datetime
from io import BytesIO

from utils.preprocess import preprocess_image_from_bytes
from utils.gradcam import generate_gradcam_base64
from utils.ai_response import generate_ai_response, normalize_disease_name
from utils.xray_validator import is_chest_xray
from utils.pdf_report import generate_pdf_bytes

app = Flask(__name__)

# ✅ CORS
CORS(app, resources={r"/*": {"origins": "*"}})

MAX_FILE_SIZE_MB = 10
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE_MB * 1024 * 1024
CONFIDENCE_THRESHOLD = 60.0

# ✅ Tensorflow memory optimization
tf.config.threading.set_intra_op_parallelism_threads(1)
tf.config.threading.set_inter_op_parallelism_threads(1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(BASE_DIR, "model", "chest_xray_vgg16_final_model.keras")
CLASS_PATH = os.path.join(BASE_DIR, "model", "class_names.json")

# ✅ Load model once (GLOBAL)
model = tf.keras.models.load_model(MODEL_PATH, compile=False)

with open(CLASS_PATH, "r") as f:
    class_names = json.load(f)


@app.route("/", methods=["GET"])
def home():
    return jsonify({"message": "Backend is running successfully 🚀"}), 200


@app.errorhandler(413)
def file_too_large(error):
    return jsonify({
        "error": f"File size too large. Upload below {MAX_FILE_SIZE_MB}MB."
    }), 200


def validate_patient_details(form):
    patient_name = form.get("patient_name", "").strip()
    patient_age = form.get("patient_age", "").strip()
    patient_gender = form.get("patient_gender", "").strip()
    patient_phone = form.get("patient_phone", "").strip()

    if not all([patient_name, patient_age, patient_gender, patient_phone]):
        return None, jsonify({"error": "Please fill all patient details."}), 200

    return {
        "patient_name": patient_name,
        "patient_age": patient_age,
        "patient_gender": patient_gender,
        "patient_phone": patient_phone
    }, None, None


@app.route("/predict", methods=["POST"])
def predict():
    try:
        if "image" not in request.files:
            return jsonify({"error": "Please upload an image file."}), 200

        file = request.files["image"]

        # ✅ Validate patient details
        patient_data, err_resp, err_code = validate_patient_details(request.form)
        if err_resp:
            return err_resp, err_code

        # ✅ Validate file type
        if not file.mimetype or not file.mimetype.startswith("image/"):
            return jsonify({"error": "Please upload a valid image format."}), 200

        image_bytes = file.read()

        # ✅ Validate file size
        if len(image_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
            return jsonify({
                "error": f"File size too large. Upload below {MAX_FILE_SIZE_MB}MB."
            }), 200

        # ✅ Preprocess image
        img_array, original_img = preprocess_image_from_bytes(image_bytes)

        if img_array is None or original_img is None:
            return jsonify({"error": "Please upload a valid image format."}), 200

        # ✅ Validate Chest X-ray
        if not is_chest_xray(img_array):
            return jsonify({"error": "Please upload a valid Chest X-ray image."}), 200

        # ✅ Predict
        preds = model.predict(img_array, verbose=0)
        class_idx = int(np.argmax(preds))
        confidence = float(np.max(preds)) * 100

        disease = normalize_disease_name(class_names[class_idx])

        # ✅ Encode input image
        _, buffer = cv2.imencode(".png", original_img)
        input_image_base64 = base64.b64encode(buffer).decode("utf-8")

        response = {
            **patient_data,
            "disease": disease,
            "confidence": round(confidence, 2),
            "input_image": input_image_base64
        }

        # ✅ Confidence warning
        if confidence < CONFIDENCE_THRESHOLD:
            response["confidence_warning"] = (
                "Prediction confidence is low. Please consult a doctor for confirmation."
            )

        # ✅ Grad-CAM only if disease is not NORMAL
        if disease != "NORMAL":
            gradcam_base64 = generate_gradcam_base64(
                model, img_array, original_img, class_idx
            )
            response["gradcam_image"] = gradcam_base64

        # ✅ AI response
        response["ai_response"] = generate_ai_response(disease)

        # ✅ Date & Time
        now = datetime.now()
        response["date_str"] = now.strftime("%d-%m-%Y")
        response["time_str"] = now.strftime("%I:%M %p")

        response["pdf_available"] = True

        return jsonify(response), 200

    except Exception as e:
        return jsonify({"error": f"Server crashed: {str(e)}"}), 500


@app.route("/download_report", methods=["POST"])
def download_report():
    try:
        data = request.json

        patient_data = data.get("patient_data", {})
        prediction_data = data.get("prediction_data", {})

        now = datetime.now()
        prediction_data["date_str"] = now.strftime("%d-%m-%Y")
        prediction_data["time_str"] = now.strftime("%I:%M %p")

        pdf_bytes = generate_pdf_bytes(patient_data, prediction_data)

        return send_file(
            BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name="ChestXray_Report.pdf"
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
