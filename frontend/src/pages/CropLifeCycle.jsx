import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PageHeader from "../components/PageHeader";
import { translateDynamicContent, translateArray, translateObject } from "../services/translationService";
import { useAgriAI } from "../context/AgriAIContext";
import "./CropLifeCycle.css";

const API_URL = "http://localhost:5000/api/crop-life-cycle";

const stageIcons = {
  "Seed": "🌰",
  "Germination": "🌱",
  "Vegetative Growth": "🌿",
  "Flowering": "🌸",
  "Fruit/Grain Formation": "🍅",
  "Harvest": "🚜",
  "default": "🪴"
};

function CropLifeCycle() {
  const { t } = useTranslation();
  const { openChatWithContext } = useAgriAI();
  const [crops, setCrops] = useState([]);
  const [selectedCrop, setSelectedCrop] = useState("");
  const [crop, setCrop] = useState(null);

  const [loadingCrops, setLoadingCrops] = useState(true);
  const [loadingLifeCycle, setLoadingLifeCycle] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchCrops = async () => {
      try {
        setLoadingCrops(true);
        setError("");
        const response = await fetch(`${API_URL}/`);
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || "Failed to fetch crops");
        
        setCrops(data.crops);
        if (data.crops.length > 0) setSelectedCrop(data.crops[0].name);
      } catch (err) {
        console.error("Crop fetch error:", err);
        setError("Unable to connect to the server. Make sure the backend is running.");
      } finally {
        setLoadingCrops(false);
      }
    };
    fetchCrops();
  }, []);

  useEffect(() => {
    if (!selectedCrop) return;

    const fetchLifeCycle = async () => {
      try {
        setLoadingLifeCycle(true);
        setError("");
        setCrop(null);

        const response = await fetch(`${API_URL}/${encodeURIComponent(selectedCrop)}`);
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || "Failed to fetch life cycle");
        
        let translatedCrop = await translateObject(data.crop);
        
        setCrop(translatedCrop);
      } catch (err) {
        console.error("Life cycle fetch error:", err);
        setError("Unable to load the selected crop life cycle.");
      } finally {
        setLoadingLifeCycle(false);
      }
    };
    fetchLifeCycle();
  }, [selectedCrop]);

  const getStageIcon = (stageName) => {
    for (const key in stageIcons) {
      if (stageName.includes(key)) return stageIcons[key];
    }
    return stageIcons["default"];
  };

  return (
    <div className="page-container">
      <PageHeader 
        title={t("sidebar.cropLifeCycle")} 
        description={t("cropLifeCycle.pageDescription")} 
      />

      <div className="content-card selector-card">
        <div className="selector-content">
          <div className="selector-icon">🌱</div>
          <div className="selector-text">
            <h3>{t("cropLifeCycle.selectTitle")}</h3>
            <p>{t("cropLifeCycle.selectDesc")}</p>
          </div>
        </div>

        <div className="selector-dropdown">
          {loadingCrops ? (
            <p className="loading-text">{t("cropLifeCycle.loadingCrops")}</p>
          ) : crops.length === 0 ? (
            <p>{t("cropLifeCycle.noCrops")}</p>
          ) : (
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="crop-select-input"
            >
              {crops.map((item) => (
                <option key={item._id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <div className="error-alert">❌ {error}</div>}
      {loadingLifeCycle && <div className="loading-alert">{t("cropLifeCycle.loadingLifecycle")}</div>}

      {crop && !loadingLifeCycle && (
        <div className="lifecycle-container">
          <div className="lifecycle-header">
            <h2 className="crop-title">{crop.name}</h2>
            <div className="crop-meta" style={{display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'}}>
              <span className="meta-badge">🧬 {crop.scientificName}</span>
              <span className="meta-badge">{t("cropLifeCycle.duration")}: {crop.growthDuration}</span>
              <button className="btn-primary" style={{background: '#2ecc71', borderColor: '#2ecc71', padding: '5px 15px', fontSize: '14px', height: 'auto'}} onClick={() => openChatWithContext({
                  module: 'crop_lifecycle',
                  crop: crop.name
              })}>
                  🌱 {t("cropLifeCycle.askAgriAI")}
              </button>
            </div>
          </div>

          <div className="visual-timeline">
            {crop.lifeCycle?.map((stage, index) => (
              <div className="timeline-card" key={index}>
                <div className="stage-icon-container">
                  <span className="stage-icon-large">{getStageIcon(stage.stage)}</span>
                  <div className="stage-connector"></div>
                </div>
                
                <div className="stage-content">
                  <div className="stage-header">
                    <span className="stage-number">{t("cropLifeCycle.stage")} {index + 1}</span>
                    <h3 className="stage-name">{stage.stage}</h3>
                  </div>
                  
                  <div className="stage-timing">
                    <span className="timing-icon">⏱</span>
                    <span>{stage.duration}</span>
                  </div>
                  
                  <p className="stage-description">{stage.description}</p>
                  
                  <div className="stage-details-grid">
                    {stage.farmerActions?.length > 0 && (
                      <div className="detail-box actions-box">
                        <h4>{t("cropLifeCycle.careTips")}</h4>
                        <ul>
                          {stage.farmerActions.map((action, idx) => (
                            <li key={idx}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {stage.monitoring?.length > 0 && (
                      <div className="detail-box monitor-box">
                        <h4>{t("cropLifeCycle.monitor")}</h4>
                        <ul>
                          {stage.monitoring.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="general-care-card">
            <div className="care-icon">🌾</div>
            <div className="care-content">
              <h3>{t("cropLifeCycle.generalAdviceTitle")}</h3>
              <ul className="care-list">
                <li>{t("cropLifeCycle.advice1")}</li>
                <li>{t("cropLifeCycle.advice2")}</li>
                <li>{t("cropLifeCycle.advice3")}</li>
                <li>{t("cropLifeCycle.advice4")}</li>
              </ul>
              <p className="care-disclaimer">
                <strong>{t("cropLifeCycle.disclaimer")}</strong> {t("cropLifeCycle.disclaimerText")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CropLifeCycle;