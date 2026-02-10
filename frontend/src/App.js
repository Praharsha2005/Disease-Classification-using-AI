import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import UploadForm from "./components/UploadForm";


import "./App.css";

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<UploadForm />} />

        </Routes>
      </div>
    </Router>
  );
}

export default App;
