import { Fragment, useEffect, useState } from 'react';
import { fetchVariants, fmtDuration, Variant } from './api';

export default function Variants({ app, onShowOnMap }: { app: string; onShowOnMap: (v: Variant) => void }) {
  const [variants, setVariants] = useState<Variant[] | null>(null);

  useEffect(() => {
    fetchVariants(app).then(setVariants).catch(console.error);
  }, [app]);

  const maxShare = variants?.[0]?.share ?? 1;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Process variants</h2>
        <span className="hint">each variant is a distinct end-to-end path users actually took</span>
      </div>
      <div className="panel-body">
        {!variants && <div className="empty">loading…</div>}
        {variants && variants.length === 0 && <div className="empty">No data yet — run the seed or click through the demo app.</div>}
        {variants && variants.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th style={{ width: 190 }}>Cases</th>
                <th style={{ width: 110 }}>Median time</th>
                <th>Path</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td className="num">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="share-bar">
                        <div style={{ width: `${(v.share / maxShare) * 100}%` }} />
                      </div>
                      {v.count} ({Math.round(v.share * 100)}%)
                    </div>
                  </td>
                  <td className="num">{fmtDuration(v.medianDurationMs)}</td>
                  <td>
                    <div className="chip-seq">
                      {v.activities.map((a, i) => (
                        <Fragment key={i}>
                          {i > 0 && <span className="chip-arrow">→</span>}
                          <span className="chip">{a}</span>
                        </Fragment>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button className="small" onClick={() => onShowOnMap(v)}>
                      Show on map
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
