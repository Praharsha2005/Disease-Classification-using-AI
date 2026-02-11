import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import heic2any from "heic2any";
import "./UploadForm.css";

// ✅ Backend URL from .env
const BACKEND_URL =
  (process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:5000").replace(
    /\/$/,
    ""
  );

const UploadForm = () => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);

  const [toast, setToast] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showContact, setShowContact] = useState(false);

  // ✅ History stored without pdf base64 (to avoid quota error)
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("predictionHistory");
    return saved ? JSON.parse(saved) : [];
  });

  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");

  const [countryCode, setCountryCode] = useState("+91");
  const [phoneDigits, setPhoneDigits] = useState("");

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });

  const countryList = useMemo(
    () => [
      { name: "India", code: "+91", digits: 10 },
      { name: "USA", code: "+1", digits: 10 },
      { name: "UK", code: "+44", digits: 10 },
      { name: "Australia", code: "+61", digits: 9 },
      { name: "Canada", code: "+1", digits: 10 },
      { name: "UAE", code: "+971", digits: 9 },
      { name: "Germany", code: "+49", digits: 11 },
      { name: "France", code: "+33", digits: 9 },
      { name: "Japan", code: "+81", digits: 10 },
    ],
    []
  );

  const selectedCountry = useMemo(
    () => countryList.find((c) => c.code === countryCode),
    [countryCode, countryList]
  );

  const requiredDigits = selectedCountry ? selectedCountry.digits : 10;

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("predictionHistory", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setPhoneDigits("");
  }, [countryCode]);

  const convertHeicToJpeg = async (file) => {
    const convertedBlob = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });

    return new File([convertedBlob], file.name.replace(/\.heic$/i, ".jpg"), {
      type: "image/jpeg",
    });
  };

  const handleFileChange = useCallback(async (e) => {
    let selectedFile = e.target.files[0];

    setResult(null);
    setError("");

    if (!selectedFile) return;

    setFileName(selectedFile.name);

    if (
      selectedFile.type === "image/heic" ||
      selectedFile.name.toLowerCase().endsWith(".heic")
    ) {
      try {
        setConverting(true);
        selectedFile = await convertHeicToJpeg(selectedFile);
        setFileName(selectedFile.name);
      } catch {
        setError("Unable to process HEIC image.");
        setConverting(false);
        return;
      } finally {
        setConverting(false);
      }
    }

    setFile(selectedFile);
    setToast("File selected successfully ✅");
  }, []);

  const handlePhoneChange = useCallback(
    (e) => {
      const value = e.target.value.replace(/\D/g, "");
      setPhoneDigits(value.slice(0, requiredDigits));
    },
    [requiredDigits]
  );

  // ✅ FIXED PDF Download Function (Blob download)
  const downloadPDF = useCallback(async () => {
    if (!result) {
      setToast("No prediction result available ❌");
      return;
    }

    try {
      setToast("Generating PDF... ⏳");

      const fullPhone = `${countryCode}${phoneDigits}`;

      const payload = {
        patient_data: {
          patient_name: patientName,
          patient_age: patientAge,
          patient_gender: patientGender,
          patient_phone: fullPhone,
        },
        prediction_data: {
          disease: result.disease,
          confidence: result.confidence,
          input_image: result.input_image,
          gradcam_image: result.gradcam_image || null,
          ai_response: result.ai_response,
          date_str: result.date_str || "",
          time_str: result.time_str || "",
        },
      };

      const response = await axios.post(
        `${BACKEND_URL}/download_report`,
        payload,
        {
          responseType: "blob",
          timeout: 120000,
        }
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = "ChestXray_Report.pdf";
      link.click();

      window.URL.revokeObjectURL(url);

      setToast("PDF downloaded successfully ✅");
    } catch (err) {
      console.error("PDF Download Error:", err);
      setToast("PDF download failed ❌");
    }
  }, [
    result,
    patientName,
    patientAge,
    patientGender,
    countryCode,
    phoneDigits,
  ]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem("predictionHistory");
    setToast("Prediction history cleared ✅");
  }, []);

  const getDiseaseClass = (disease) =>
    disease === "NORMAL" ? "disease-normal" : "disease-alert";

  const getDoctorRecommendation = (disease) => {
    if (!disease || disease === "NORMAL") return null;

    if (disease === "PNEUMONIA") {
      return {
        specialist: "Consult Pulmonologist (Lung Specialist)",
        physician: "Consult General Physician for treatment guidance",
        emergency:
          "Consult Emergency Doctor if severe breathing difficulty or chest pain occurs",
      };
    }

    if (disease === "COVID-19") {
      return {
        specialist: "Consult General Physician / COVID Specialist",
        physician: "Consult Pulmonologist if breathing issues persist",
        emergency:
          "Consult Emergency Doctor if oxygen levels drop or breathing becomes difficult",
      };
    }

    if (disease === "TUBERCULOSIS") {
      return {
        specialist: "Consult Pulmonologist / TB Specialist",
        physician: "Consult Infectious Disease Specialist for TB management",
        emergency:
          "Consult Emergency Doctor if coughing blood, severe weakness, or rapid weight loss occurs",
      };
    }

    return {
      specialist: "Consult General Physician",
      physician: "Consult Pulmonologist if symptoms worsen",
      emergency: "Consult Emergency Doctor if symptoms become severe",
    };
  };

  const handleSubmit = useCallback(async () => {
    if (!patientName || !patientAge || !patientGender) {
      setToast("Please fill all patient details ❌");
      return;
    }

    if (!countryCode || !phoneDigits) {
      setToast("Please enter phone number ❌");
      return;
    }

    if (phoneDigits.length !== requiredDigits) {
      setToast(
        `Phone number must be exactly ${requiredDigits} digits for ${selectedCountry.name} ❌`
      );
      return;
    }

    if (!file) {
      setError("Please select an image first.");
      setToast("Please select an image first ❌");
      return;
    }

    const fullPhone = `${countryCode}${phoneDigits}`;

    const formData = new FormData();
    formData.append("image", file);
    formData.append("patient_name", patientName);
    formData.append("patient_age", patientAge);
    formData.append("patient_gender", patientGender);
    formData.append("patient_phone", fullPhone);

    try {
      setLoading(true);
      setToast("Prediction started... ⏳");

      const response = await axios.post(`${BACKEND_URL}/predict`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 120000,
      });

      if (response.data.error) {
        setError(response.data.error);
        setResult(null);
        setToast(response.data.error);
        return;
      }

      setResult(response.data);
      setError("");
      setToast("Prediction completed successfully ✅");

      // ✅ Save history WITHOUT PDF
      const newRecord = {
        date: new Date().toLocaleString(),
        patient_name: patientName,
        patient_age: patientAge,
        patient_gender: patientGender,
        patient_phone: fullPhone,
        disease: response.data.disease,
        confidence: response.data.confidence,
      };

      setHistory((prev) => [newRecord, ...prev].slice(0, 1000));
    } catch (err) {
      console.error("Prediction Error:", err);
      setError("Backend not running or error occurred");
      setToast("Backend not running or error occurred ❌");
    } finally {
      setLoading(false);
    }
  }, [
    patientName,
    patientAge,
    patientGender,
    phoneDigits,
    countryCode,
    requiredDigits,
    selectedCountry,
    file,
  ]);

  // ✅ FIXED AI RESPONSE HEADINGS (No SECTION 1,2,3,4)
  const aiResponseContent = useMemo(() => {
    if (!result?.ai_response) return null;

    const lines = result.ai_response
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");

    return lines.map((line, idx) => {
      const upperLine = line.toUpperCase();

      if (upperLine.includes("SUMMARY")) {
        return (
          <h4 key={idx} className="ai-heading">
            SUMMARY
          </h4>
        );
      }

      if (upperLine.includes("COMMON SYMPTOMS")) {
        return (
          <h4 key={idx} className="ai-heading">
            COMMON SYMPTOMS
          </h4>
        );
      }

      if (upperLine.includes("PRECAUTIONS")) {
        return (
          <h4 key={idx} className="ai-heading">
            PRECAUTIONS
          </h4>
        );
      }

      if (
        upperLine.includes("PREVENTION MEASURES") ||
        upperLine.includes("PREVENTIONS")
      ) {
        return (
          <h4 key={idx} className="ai-heading">
            PREVENTIONS
          </h4>
        );
      }

      if (line.toLowerCase().startsWith("precautions for")) {
        return (
          <h4 key={idx} className="ai-heading">
            {line.replace("Precautions for", "").trim().toUpperCase()}
          </h4>
        );
      }

      if (line.startsWith("-") || line.startsWith("*")) {
        return (
          <li key={idx} className="ai-bullet">
            {line.replace("-", "").replace("*", "").trim()}
          </li>
        );
      }

      return (
        <p key={idx} className="ai-paragraph">
          {line}
        </p>
      );
    });
  }, [result]);

  const doctorAdvice = result ? getDoctorRecommendation(result.disease) : null;

  return (
    <div className="page-wrapper fade-in">
      {toast && <div className="toast">{toast}</div>}

      <div className="navbar">
        <div className="navbar-center">
          <h2 className="navbar-title">Chest X-ray Disease Detection</h2>
          <p className="navbar-subtitle">
            AI-powered detection of Pneumonia, COVID-19, Tuberculosis and Normal
            cases.
          </p>
        </div>

        <div className="navbar-right">
          <button className="nav-btn" onClick={() => setShowAbout(true)}>
            About
          </button>

          <button className="nav-btn" onClick={() => setShowContact(true)}>
            Contact Us
          </button>

          <button className="dark-toggle" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? "☀ Light Mode" : "🌙 Dark Mode"}
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="glass-card">
          <h3 className="card-title">Patient Details</h3>

          <div className="patient-form">
            <input
              type="text"
              placeholder="Patient Name"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
            />

            <input
              type="text"
              placeholder="Age"
              value={patientAge}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "");
                setPatientAge(value.slice(0, 3));
              }}
            />

            <select
              value={patientGender}
              onChange={(e) => setPatientGender(e.target.value)}
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>

            <div className="phone-wrapper">
              <select
                className="country-dropdown"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              >
                {countryList.map((country, idx) => (
                  <option key={idx} value={country.code}>
                    {country.name} ({country.code})
                  </option>
                ))}
              </select>

              <input
                type="text"
                className="phone-input"
                placeholder={`Enter ${requiredDigits} digit phone`}
                value={phoneDigits}
                onChange={handlePhoneChange}
              />
            </div>

            <div className="history-btn-wrapper">
              <button className="nav-btn" onClick={() => setShowHistory(true)}>
                View History
              </button>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <h3 className="card-title">Upload Chest X-ray Image</h3>
          <p className="card-subtitle">
            Supported formats: JPG, PNG, JPEG, WEBP, HEIC
          </p>

          <div className="upload-controls">
            <label className="btn-primary">
              Choose File
              <input type="file" onChange={handleFileChange} hidden />
            </label>

            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={loading || converting}
            >
              {converting
                ? "Converting..."
                : loading
                ? "Predicting..."
                : "Predict"}
            </button>
          </div>

          <div className="file-info">
            {fileName ? (
              <span className="file-name">Selected: {fileName}</span>
            ) : (
              <span className="file-placeholder">No file selected</span>
            )}
          </div>

          {(loading || converting) && (
            <div className="progress-container">
              <div className="progress-bar"></div>
            </div>
          )}

          {error && <p className="error-text">{error}</p>}
        </div>

        {result && (
          <div className="result-glass fade-in">
            <div className="result-header">
              <h2 className="result-title">Prediction Result</h2>

              <button className="pdf-btn" onClick={downloadPDF}>
                Download PDF
              </button>
            </div>

            <div className="result-info">
              {result.disease !== "NORMAL" ? (
                <p>
                  <strong>Disease:</strong>{" "}
                  <span className={getDiseaseClass(result.disease)}>
                    {result.disease}
                  </span>
                </p>
              ) : (
                <p>
                  <strong>Prediction:</strong>{" "}
                  <span className={getDiseaseClass(result.disease)}>
                    NORMAL (Healthy Chest X-ray)
                  </span>
                </p>
              )}

              <p>
                <strong>Confidence:</strong> {result.confidence}%
              </p>
            </div>

            <div className="images-grid">
              <div className="image-box">
                <h3>Uploaded X-ray</h3>
                <img
                  src={`data:image/png;base64,${result.input_image}`}
                  alt="Uploaded X-ray"
                  loading="lazy"
                />
              </div>

              {result.gradcam_image && (
                <div className="image-box">
                  <h3>Grad-CAM Output</h3>
                  <img
                    src={`data:image/png;base64,${result.gradcam_image}`}
                    alt="GradCAM"
                    loading="lazy"
                  />
                </div>
              )}
            </div>

            {doctorAdvice && (
              <div className="doctor-box">
                <h3 className="doctor-title">Doctor Recommendation</h3>
                <p>
                  <strong>Specialist:</strong> {doctorAdvice.specialist}
                </p>
                <p>
                  <strong>Physician:</strong> {doctorAdvice.physician}
                </p>
                <p>
                  <strong>Emergency:</strong>{" "}
                  <span className="urgency-tag">{doctorAdvice.emergency}</span>
                </p>
              </div>
            )}

            <h2 className="ai-title">AI Medical Guidance</h2>

            <div className="ai-response">
              <ul className="ai-list">{aiResponseContent}</ul>
            </div>
          </div>
        )}
      </div>

      {/* About Modal */}
      {showAbout && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h2>About This Project</h2>
              <button className="close-btn" onClick={() => setShowAbout(false)}>
                ✖
              </button>
            </div>

            <p className="about-paragraph">
              This Chest X-ray Disease Detection System is an AI-powered web
              application designed to assist in the early identification of
              lung-related diseases using Chest X-ray images. The system uses a
              Deep Learning model trained on medical imaging datasets to detect
              and classify X-ray scans into four categories: Pneumonia, COVID-19,
              Tuberculosis, and Normal cases. After the user uploads a Chest
              X-ray image, the model processes the image, analyzes important
              patterns in the lungs, and generates a prediction along with a
              confidence score. For better transparency, the application also
              provides Grad-CAM visualization, which highlights the regions of
              the X-ray image where the model focused most during the prediction
              process. In addition, the system generates AI-based medical
              guidance, including precautions and prevention measures, and
              provides a downloadable PDF report containing the complete
              prediction details. This project is developed for educational and
              research purposes and aims to demonstrate how Artificial
              Intelligence can support medical imaging analysis. However, the
              results generated by this application should not be considered as
              a final medical diagnosis, and users are strongly advised to
              consult a certified medical professional for confirmation and
              treatment.
            </p>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContact && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h2>Contact Us</h2>
              <button
                className="close-btn"
                onClick={() => setShowContact(false)}
              >
                ✖
              </button>
            </div>

            <p className="contact-line">
              📧 <strong>Email:</strong> praharsha@gmail.com
            </p>
            <p className="contact-line">
              📞 <strong>Phone:</strong> +91 1234567890
            </p>
            <p className="contact-line">
              🕒 <strong>Support Hours:</strong> Monday – Saturday (9 AM – 6 PM)
            </p>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h2>Prediction History</h2>
              <button
                className="close-btn"
                onClick={() => setShowHistory(false)}
              >
                ✖
              </button>
            </div>

            {history.length === 0 ? (
              <p className="empty-history">No predictions yet.</p>
            ) : (
              <>
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Disease</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>

                    <tbody>
                      {history.map((item, idx) => {
                        const [datePart, timePart] = item.date.split(",");

                        return (
                          <tr key={idx}>
                            <td>{datePart?.trim()}</td>
                            <td>{timePart?.trim()}</td>
                            <td>{item.patient_name}</td>
                            <td>{item.patient_phone}</td>
                            <td>{item.disease}</td>
                            <td>{item.confidence}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="history-actions">
                  <button className="nav-btn danger-btn" onClick={clearHistory}>
                    Clear History
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="footer">
        <p>
          ⚠ Disclaimer: This AI-generated result is for educational and
          informational purposes only. Please consult a certified medical doctor
          for diagnosis and treatment.
        </p>
        <p className="footer-small">
          © {new Date().getFullYear()} Chest X-ray Disease Detection System
        </p>
      </footer>
    </div>
  );
};

export default UploadForm;
