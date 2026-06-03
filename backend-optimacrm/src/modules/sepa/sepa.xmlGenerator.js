import { escapeXml, formatAmount } from './sepa.validators.js';

/**
 * Génère le XML SEPA Direct Debit pain.008.001.02
 *
 * @param {Object} creancier - Paramètres du créancier
 * @param {Array} factures - Factures avec données client jointes
 * @param {string} dateCollecte - Date de prélèvement (YYYY-MM-DD)
 * @param {string} msgId - Identifiant unique du message
 * @param {string} pmtInfId - Identifiant du lot de paiement
 * @returns {string} Contenu XML complet
 */
export function generateSepaXml(creancier, factures, dateCollecte, msgId, pmtInfId) {
  const nbOfTxs = factures.length;
  const ctrlSum = formatAmount(
    factures.reduce((sum, f) => sum + parseFloat(f.total_ttc), 0)
  );
  const creDtTm = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">\n`;
  xml += `  <CstmrDrctDbtInitn>\n`;

  // ── GrpHdr ──────────────────────────────────────────────────────────────
  xml += `    <GrpHdr>\n`;
  xml += `      <MsgId>${escapeXml(msgId)}</MsgId>\n`;
  xml += `      <CreDtTm>${creDtTm}</CreDtTm>\n`;
  xml += `      <NbOfTxs>${nbOfTxs}</NbOfTxs>\n`;
  xml += `      <CtrlSum>${ctrlSum}</CtrlSum>\n`;
  xml += `      <InitgPty>\n`;
  xml += `        <Nm>${escapeXml(creancier.nom)}</Nm>\n`;
  xml += `      </InitgPty>\n`;
  xml += `    </GrpHdr>\n`;

  // ── PmtInf ──────────────────────────────────────────────────────────────
  xml += `    <PmtInf>\n`;
  xml += `      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>\n`;
  xml += `      <PmtMtd>DD</PmtMtd>\n`;
  xml += `      <BtchBookg>false</BtchBookg>\n`;
  xml += `      <NbOfTxs>${nbOfTxs}</NbOfTxs>\n`;
  xml += `      <CtrlSum>${ctrlSum}</CtrlSum>\n`;

  // PmtTpInf
  xml += `      <PmtTpInf>\n`;
  xml += `        <SvcLvl>\n`;
  xml += `          <Cd>SEPA</Cd>\n`;
  xml += `        </SvcLvl>\n`;
  xml += `        <LclInstrm>\n`;
  xml += `          <Cd>CORE</Cd>\n`;
  xml += `        </LclInstrm>\n`;
  xml += `        <SeqTp>RCUR</SeqTp>\n`;
  xml += `      </PmtTpInf>\n`;

  xml += `      <ReqdColltnDt>${dateCollecte}</ReqdColltnDt>\n`;

  // Créancier
  xml += `      <Cdtr>\n`;
  xml += `        <Nm>${escapeXml(creancier.nom)}</Nm>\n`;
  xml += `      </Cdtr>\n`;
  xml += `      <CdtrAcct>\n`;
  xml += `        <Id>\n`;
  xml += `          <IBAN>${creancier.iban.replace(/\s/g, '')}</IBAN>\n`;
  xml += `        </Id>\n`;
  xml += `      </CdtrAcct>\n`;
  xml += `      <CdtrAgt>\n`;
  xml += `        <FinInstnId>\n`;
  xml += `          <BIC>${creancier.bic.replace(/\s/g, '')}</BIC>\n`;
  xml += `        </FinInstnId>\n`;
  xml += `      </CdtrAgt>\n`;
  xml += `      <ChrgBr>SLEV</ChrgBr>\n`;

  // CdtrSchmeId
  xml += `      <CdtrSchmeId>\n`;
  xml += `        <Id>\n`;
  xml += `          <PrvtId>\n`;
  xml += `            <Othr>\n`;
  xml += `              <Id>${escapeXml(creancier.ics)}</Id>\n`;
  xml += `              <SchmeNm>\n`;
  xml += `                <Prtry>SEPA</Prtry>\n`;
  xml += `              </SchmeNm>\n`;
  xml += `            </Othr>\n`;
  xml += `          </PrvtId>\n`;
  xml += `        </Id>\n`;
  xml += `      </CdtrSchmeId>\n`;

  // ── DrctDbtTxInf (une par facture) ────────────────────────────────────
  for (const f of factures) {
    const instrId = `REF${f.facture_id}`;
    const endToEndId = f.numero_facture;
    const montant = formatAmount(f.total_ttc);
    const rum = f.reference_mandat_sepa;
    const dtOfSgntr = f.date_mandat_sepa;
    const codeClient = f.code_client || f.numero_client;
    const dbtrNm = f.client_raison_sociale || f.raison_sociale;
    const iban = f.iban.replace(/\s/g, '');
    const bic = f.bic.replace(/\s/g, '');

    xml += `      <DrctDbtTxInf>\n`;
    xml += `        <PmtId>\n`;
    xml += `          <InstrId>${escapeXml(instrId)}</InstrId>\n`;
    xml += `          <EndToEndId>${escapeXml(endToEndId)}</EndToEndId>\n`;
    xml += `        </PmtId>\n`;
    xml += `        <InstdAmt Ccy="EUR">${montant}</InstdAmt>\n`;
    xml += `        <DrctDbtTx>\n`;
    xml += `          <MndtRltdInf>\n`;
    xml += `            <MndtId>${escapeXml(rum)}</MndtId>\n`;
    xml += `            <DtOfSgntr>${dtOfSgntr}</DtOfSgntr>\n`;
    xml += `          </MndtRltdInf>\n`;
    xml += `        </DrctDbtTx>\n`;
    xml += `        <DbtrAgt>\n`;
    xml += `          <FinInstnId>\n`;
    xml += `            <BIC>${bic}</BIC>\n`;
    xml += `          </FinInstnId>\n`;
    xml += `        </DbtrAgt>\n`;
    xml += `        <Dbtr>\n`;
    xml += `          <Nm>${escapeXml(dbtrNm)}</Nm>\n`;
    xml += `        </Dbtr>\n`;
    xml += `        <DbtrAcct>\n`;
    xml += `          <Id>\n`;
    xml += `            <IBAN>${iban}</IBAN>\n`;
    xml += `          </Id>\n`;
    xml += `        </DbtrAcct>\n`;
    xml += `        <UltmtCdtr>\n`;
    xml += `          <Nm>${escapeXml(codeClient)}</Nm>\n`;
    xml += `        </UltmtCdtr>\n`;
    xml += `      </DrctDbtTxInf>\n`;
  }

  xml += `    </PmtInf>\n`;
  xml += `  </CstmrDrctDbtInitn>\n`;
  xml += `</Document>`;

  return xml;
}
