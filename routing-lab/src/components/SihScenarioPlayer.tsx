import React, { useState, useEffect, useRef } from 'react';
import { SIH_SCENARIOS } from '../data/sihScenarioData';
import {
  initSihScenarioExecution,
  executeNextSihStep,
  type SihExecutionState,
} from '../services/sihScenarioService';
import type { Incident } from '../types/incident';
import type { Responder } from '../types/responder';
import type { Mission } from '../types/mission';

interface SihScenarioPlayerProps {
  incidents: Incident[];
  responders: Responder[];
  missions: Mission[];
  onUpdateOperationalState: (
    newIncidents: Incident[],
    newResponders: Responder[],
    newMissions: Mission[]
  ) => void;
}

export const SihScenarioPlayer: React.FC<SihScenarioPlayerProps> = ({
  incidents,
  responders,
  missions,
  onUpdateOperationalState,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(SIH_SCENARIOS[0].id);
  const [execState, setExecState] = useState<SihExecutionState>(() =>
    initSihScenarioExecution(SIH_SCENARIOS[0])
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const autoPlayIntervalRef = useRef<number | null>(null);

  const activeScenario = SIH_SCENARIOS.find((s) => s.id === selectedScenarioId) || SIH_SCENARIOS[0];

  const handleSelectScenario = (scenarioId: string) => {
    const scn = SIH_SCENARIOS.find((s) => s.id === scenarioId) || SIH_SCENARIOS[0];
    setSelectedScenarioId(scenarioId);
    setExecState(initSihScenarioExecution(scn));
    if (autoPlayIntervalRef.current) clearInterval(autoPlayIntervalRef.current);
    setIsPlaying(false);
  };

  const handleNextStep = () => {
    const res = executeNextSihStep(execState, incidents, responders, missions);
    setExecState(res.nextExecutionState);
    onUpdateOperationalState(res.updatedIncidents, res.updatedResponders, res.updatedMissions);

    if (res.nextExecutionState.isComplete && autoPlayIntervalRef.current) {
      clearInterval(autoPlayIntervalRef.current);
      setIsPlaying(false);
    }
  };

  const handleReset = () => {
    setExecState(initSihScenarioExecution(activeScenario));
    if (autoPlayIntervalRef.current) clearInterval(autoPlayIntervalRef.current);
    setIsPlaying(false);
  };

  const handleToggleAutoPlay = () => {
    if (isPlaying) {
      if (autoPlayIntervalRef.current) clearInterval(autoPlayIntervalRef.current);
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      autoPlayIntervalRef.current = window.setInterval(() => {
        handleNextStep();
      }, 2500);
    }
  };

  useEffect(() => {
    return () => {
      if (autoPlayIntervalRef.current) clearInterval(autoPlayIntervalRef.current);
    };
  }, []);

  return (
    <div className="resq-sih-container" id="resq-sih-scenario-player">
      <div className="resq-card sih-control-card">
        <div className="sih-header">
          <div className="sih-badge-tag">SIH DEMO SCENARIO ENGINE</div>
          <h2 className="sih-title">Emergency Event Flow Demonstrator</h2>
          <p className="sih-desc">
            Triggers controlled real-world emergency events into ResQnet Core for interactive review of Citizen SOS, Coordinator Dispatch, and Responder Mission execution.
          </p>
        </div>

        <div className="sih-scenario-picker">
          <label className="sih-picker-label">Select Demo Scenario:</label>
          <select
            className="sih-select"
            value={selectedScenarioId}
            onChange={(e) => handleSelectScenario(e.target.value)}
          >
            {SIH_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.targetRegion})
              </option>
            ))}
          </select>
        </div>

        {/* Timeline Progress Bar */}
        <div className="sih-stepper-progress">
          <div className="sih-step-info">
            <span>
              Step {execState.currentStepIndex} of {activeScenario.steps.length}
            </span>
            <span className="sih-current-action">
              {execState.isComplete
                ? '🏁 Scenario Completed'
                : activeScenario.steps[execState.currentStepIndex]?.title || 'Ready'}
            </span>
          </div>
          <div className="sih-progress-track">
            <div
              className="sih-progress-fill"
              style={{
                width: `${(execState.currentStepIndex / activeScenario.steps.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Control Buttons */}
        <div className="sih-actions-row">
          <button
            id="btn-sih-step-next"
            className="btn-sih-step"
            disabled={execState.isComplete}
            onClick={handleNextStep}
          >
            ▶ Step Next Event
          </button>
          <button
            id="btn-sih-autoplay"
            className={`btn-sih-play ${isPlaying ? 'playing' : ''}`}
            disabled={execState.isComplete}
            onClick={handleToggleAutoPlay}
          >
            {isPlaying ? '⏸ Pause Auto-Play' : '⚡ Auto-Play Timeline'}
          </button>
          <button id="btn-sih-reset" className="btn-sih-reset" onClick={handleReset}>
            ↺ Reset Scenario
          </button>
        </div>
      </div>

      {/* Real-time Scenario Event Log */}
      <div className="resq-card sih-log-card">
        <h4 className="sih-log-heading">Operational Event Log Stream</h4>
        <div className="sih-log-stream" id="sih-event-log-container">
          {execState.logMessages.map((msg, idx) => (
            <div key={idx} className="sih-log-entry">
              <span className="log-bullet">●</span>
              <span className="log-text">{msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
