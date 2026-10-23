/**
 * Admin dashboard reports & analytics module.
 * Provides occupancy analytics, revenue reports, and export/print features.
 */

import { Toast } from '../../render/toast.js';

export function printReport() {
  window.print();
}

export function exportReportCsv() {
  const rows = [
    ['Unit / Room Name', 'Category', 'Capacity', 'Occupied', 'Occupancy Rate', 'Monthly Rent', 'Expected Revenue'],
    ['Triple Occupancy Room', 'Living Space', '12', '11', '92%', '3200', '35200'],
    ['Double Occupancy Room', 'Living Space', '6', '5', '83%', '4000', '20000'],
    ['Single Occupancy Room', 'Living Space', '4', '2', '50%', '5500', '11000'],
    ['Commercial Space', 'Business', '3', '3', '100%', '12000', '36000'],
    [],
    ['Financial Summary', 'Amount (PHP)', 'Percentage'],
    ['Total Contracted Rent', '60000.00', '100%'],
    ['Rent Collected (May 2026)', '45000.00', '75%'],
    ['Pending / Overdue Rent', '15000.00', '25%']
  ];

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'homespot_residences_report_may2026.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();

  Toast.success('Report exported to homespot_residences_report_may2026.csv');
}

export function initReports() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-action="print-report"]')) {
      printReport();
      return;
    }

    if (target.closest('[data-action="export-report-csv"]')) {
      exportReportCsv();
    }
  });
}
