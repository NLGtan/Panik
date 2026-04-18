import { formatUnits } from "viem";
import type { PositionView } from "../types";
import { isAavePosition, isUniswapPosition } from "../types";
import { StatusTag } from "./StatusTag";

interface PositionListProps {
  title?: string;
  positions: PositionView[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (positionId: string) => void;
}

export function PositionList(props: PositionListProps) {
  const {
    title,
    positions,
    selectable = false,
    selected = new Set(),
    onToggle,
  } = props;

  if (positions.length === 0) {
    return null;
  }

  return (
    <div className="position-section">
      {title && <h3 className="position-section-title">{title}</h3>}
      <div className="position-list">
        {positions.map((position) => {
          const checked = selected.has(position.id);
          const disabled = !position.eligible || !selectable;

          return (
            <article
              key={position.id}
              className={`position-card ${position.eligible ? "" : "disabled"}`}
            >
              <div className="position-main">
                <div className="position-left">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onToggle?.(position.id)}
                    />
                  )}
                  <div>
                    {isAavePosition(position) && (
                      <>
                        <div className="position-title">Aave | {position.asset.symbol}</div>
                        <div className="muted">
                          Supply: {formatUnits(position.collateralAmount, position.asset.decimals)}{" "}
                          {position.asset.symbol}
                        </div>
                        <div className="muted">
                          Debt:{" "}
                          {formatUnits(
                            position.stableDebtAmount + position.variableDebtAmount,
                            position.asset.decimals
                          )}{" "}
                          {position.asset.symbol}
                        </div>
                      </>
                    )}
                    {isUniswapPosition(position) && (
                      <>
                        <div className="position-title">
                          Uniswap V3 | {position.symbol0} / {position.symbol1} {position.feeTier}
                        </div>
                        <div className="muted">
                          Liquidity: {position.liquidity.toString()}
                        </div>
                        <div className="muted">
                          {position.inRange ? "✓ In Range" : "⚠ Out of Range"}
                        </div>
                        {(position.tokensOwed0 > 0n || position.tokensOwed1 > 0n) && (
                          <div className="muted">
                            Fees: {position.tokensOwed0.toString()} {position.symbol0} /{" "}
                            {position.tokensOwed1.toString()} {position.symbol1}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <StatusTag tag={position.tag} />
              </div>
              <div className="reason">{position.reason}</div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
