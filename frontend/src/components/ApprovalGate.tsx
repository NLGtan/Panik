import { useEffect, useMemo, useReducer } from "react";
import type { UsePanikApprovalsReturn } from "../hooks/usePanikApprovals";

interface ApprovalGateProps {
  approvals: UsePanikApprovalsReturn;
}

type GateState = {
  dismissed: boolean;
  lastNeedsApproval: boolean;
};

type GateAction =
  | { type: "DISMISS" }
  | { type: "SYNC_NEEDS_APPROVAL"; needsApproval: boolean };

function gateReducer(state: GateState, action: GateAction): GateState {
  switch (action.type) {
    case "DISMISS":
      return { ...state, dismissed: true };
    case "SYNC_NEEDS_APPROVAL":
      if (action.needsApproval && !state.lastNeedsApproval) {
        return { dismissed: false, lastNeedsApproval: true };
      }
      if (!action.needsApproval && state.lastNeedsApproval) {
        return { ...state, lastNeedsApproval: false };
      }
      return state;
    default:
      return state;
  }
}

export function ApprovalGate({ approvals }: ApprovalGateProps) {
  const {
    needsApproval,
    missingApprovals,
    needsNftApproval,
    approveAll,
    recheckApprovals,
    isLoading,
    isApproving,
    approvalComplete,
    progress,
    error,
  } = approvals;

  const [gateState, dispatch] = useReducer(gateReducer, {
    dismissed: false,
    lastNeedsApproval: false,
  });

  useEffect(() => {
    dispatch({ type: "SYNC_NEEDS_APPROVAL", needsApproval });
  }, [needsApproval]);

  const showSuccess = approvalComplete && !gateState.dismissed;

  useEffect(() => {
    if (!approvalComplete || gateState.dismissed) return;
    const timer = setTimeout(() => {
      dispatch({ type: "DISMISS" });
    }, 2000);
    return () => clearTimeout(timer);
  }, [approvalComplete, gateState.dismissed]);

  const showModal = useMemo(() => {
    if (isLoading) return false;
    if (gateState.dismissed) return false;
    return needsApproval || isApproving || showSuccess;
  }, [gateState.dismissed, isApproving, isLoading, needsApproval, showSuccess]);

  if (!showModal) {
    return null;
  }

  const totalStepCount = missingApprovals.length + (needsNftApproval ? 1 : 0);

  return (
    <div className="approval-overlay">
      <div className="approval-modal">
        {showSuccess ? (
          <>
            <div className="approval-success">✓</div>
            <h2>Ready to exit</h2>
            <p className="muted">All approvals confirmed.</p>
            <button
              className="recheck-link"
              onClick={() => recheckApprovals()}
            >
              Re-check
            </button>
          </>
        ) : (
          <>
            <h2>Enable PANIK</h2>
            <p className="muted">
              One-time approvals so PANIK can execute exits atomically.
            </p>

            <div className="approval-steps">
              {missingApprovals.map((step) => (
                <div key={step.address} className="approval-step">
                  <span className="approval-step-dot" />
                  <span>{step.symbol}</span>
                </div>
              ))}
              {needsNftApproval && (
                <div className="approval-step">
                  <span className="approval-step-dot" />
                  <span>Uniswap V3 LP Positions</span>
                </div>
              )}
            </div>

            {progress && <div className="approval-progress">{progress}</div>}

            {error && (
              <div className="banner danger" style={{ marginTop: 12, marginBottom: 0 }}>
                {error}
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <button className="btn-primary" onClick={() => void approveAll()} disabled={isApproving}>
                {isApproving
                  ? progress ?? "Approving..."
                  : `Approve all (${totalStepCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
