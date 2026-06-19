'use client';

import { useState, useRef } from 'react';
import { useToast } from '../layout';
import * as XLSX from 'xlsx';

interface PreviewRow {
  name: string; company: string; email: string; phone: string; amount_due: number; currency: string;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ total: number; success: number; failed: number; errors: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const processFile = (f: File) => {
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
        const mapped: PreviewRow[] = json.map((row) => ({
          name: String(row['name'] || row['nom'] || row['Name'] || row['Nom'] || row['NOM'] || row['Client'] || row['client'] || ''),
          company: String(row['company'] || row['entreprise'] || row['Company'] || row['Entreprise'] || row['société'] || row['Société'] || ''),
          email: String(row['email'] || row['Email'] || row['EMAIL'] || row['mail'] || row['Mail'] || ''),
          phone: String(row['phone'] || row['telephone'] || row['Phone'] || row['Tel'] || row['tel'] || row['Téléphone'] || ''),
          amount_due: parseFloat(String(row['amount_due'] || row['montant'] || row['Amount'] || row['Montant'] || row['MONTANT'] || '0')) || 0,
          currency: String(row['currency'] || row['devise'] || row['Currency'] || 'MAD'),
        }));
        setPreview(mapped.slice(0, 100));
      } catch {
        showToast('Erreur de lecture du fichier', 'error');
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients: preview }),
      });
      const data = await res.json();
      setResult(data);
      showToast(`${data.success} client(s) importé(s) avec succès`);
    } catch {
      showToast('Erreur lors de l\'importation', 'error');
    }
    setImporting(false);
  };

  const formatMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Importer des Clients</h2>
          <p className="page-subtitle">Importez vos clients depuis un fichier Excel ou CSV</p>
        </div>
      </div>

      {/* Upload Zone */}
      {!file && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-body">
            <div
              className={`import-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
            >
              <div className="import-zone-icon"><i className="ph ph-file-xls"></i></div>
              <p className="import-zone-title">Glissez votre fichier ici</p>
              <p className="import-zone-text">ou cliquez pour sélectionner un fichier Excel (.xlsx) ou CSV</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); }} style={{ display: 'none' }} />
            </div>
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
              <p className="text-sm fw-600 mb-1"><i className="ph ph-info" style={{ color: 'var(--gold)', marginRight: '0.35rem' }}></i>Colonnes acceptées :</p>
              <p className="text-xs text-muted">name/nom, company/entreprise, email, phone/telephone, amount_due/montant, currency/devise</p>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && !result && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h3 className="card-title"><i className="ph ph-eye" style={{ color: 'var(--gold)', marginRight: '0.5rem' }}></i>Prévisualisation ({preview.length} lignes)</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-outline btn-sm" onClick={() => { setFile(null); setPreview([]); }}>
                <i className="ph ph-arrow-counter-clockwise"></i> Changer le fichier
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing}>
                {importing ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span> Importation...</> : <><i className="ph ph-upload-simple"></i> Importer {preview.length} clients</>}
              </button>
            </div>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Nom</th><th>Entreprise</th><th>Email</th><th>Téléphone</th><th style={{ textAlign: 'right' }}>Montant</th><th>Devise</th></tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 550 }}>{row.name || <span className="text-danger">Manquant</span>}</td>
                    <td className="text-sm">{row.company}</td>
                    <td className="text-sm">{row.email || <span className="text-danger">Manquant</span>}</td>
                    <td className="text-sm">{row.phone}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(row.amount_due)}</td>
                    <td>{row.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 20 && <div className="card-footer"><p className="text-sm text-muted">...et {preview.length - 20} autres lignes</p></div>}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.25rem' }}>
              <i className="ph ph-check-circle"></i>
            </div>
            <h3 className="font-heading" style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Importation terminée</h3>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', margin: '1.5rem 0' }}>
              <div><div className="stat-card-value text-success">{result.success}</div><div className="text-sm text-muted">Importés</div></div>
              <div><div className="stat-card-value text-danger">{result.failed}</div><div className="text-sm text-muted">Échoués</div></div>
              <div><div className="stat-card-value">{result.total}</div><div className="text-sm text-muted">Total</div></div>
            </div>
            {result.errors.length > 0 && (
              <div style={{ textAlign: 'left', marginTop: '1rem', padding: '1rem', background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)' }}>
                <p className="text-sm fw-600 text-danger mb-1">Erreurs :</p>
                {result.errors.map((e, i) => <p key={i} className="text-xs text-danger">{e}</p>)}
              </div>
            )}
            <button className="btn btn-primary mt-3" onClick={() => { setFile(null); setPreview([]); setResult(null); }}>
              <i className="ph ph-arrow-counter-clockwise"></i> Nouvelle importation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
