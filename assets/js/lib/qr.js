/**
 * QR Ph / GCash payload construction (EMVCo-compatible tag string).
 *
 * Pure: builds the string, does not render anything.
 */

/**
 * Builds the EMVCo QR payload for a PayMongo QR Ph payment.
 *
 * Tag layout:
 *   00 01 01                       payload format indicator
 *   26 48 0010ph.paymongo          merchant account / scheme
 *   52 04 0000                     merchant category code
 *   53 03 608                      transaction currency (PHP)
 *   54 <len> <amount>              transaction amount, in pesos
 *   58 02 PH                       country
 *   59 25 <merchant>               merchant name
 *   60 06 MANILA                   merchant city
 *   62 19 05 15 <reference>        additional data (reference number)
 *   63 04                          CRC placeholder
 *
 * @param {Object} params
 * @param {number|string} params.amount - amount in PESOS (not centavos)
 * @param {string} params.reference - unique payment reference
 * @param {string} [params.merchant]
 * @returns {string} the raw payload to encode as a QR code
 */
export function buildQrPhPayload({ amount, reference, merchant = 'MJP RESIDENCES' }) {
  const pesoAmount = Number(amount);
  const amountField = Number.isFinite(pesoAmount) ? pesoAmount.toFixed(2) : '0.00';

  return [
    '00020101021226480010',
    'ph.paymongo',
    '52040000',
    '5303608',
    `54${pad2(amountField.length)}${amountField}`,
    '5802PH',
    `5925${slice(merchant, 25)}`,
    '6006MANILA',
    `62190515${slice(reference, 25)}`,
    '6304'
  ].join('');
}

/**
 * Wraps a payload in a QR image URL.
 *
 * NOTE: this sends the amount and reference to a third-party image service
 * (api.qrserver.com). For production, render the QR client-side instead.
 *
 * @param {Object} params same shape as buildQrPhPayload
 * @returns {string}
 */
export function qrImageUrl(params) {
  const payload = buildQrPhPayload(params);
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(payload)}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function slice(value, max) {
  return String(value ?? '').slice(0, max);
}
