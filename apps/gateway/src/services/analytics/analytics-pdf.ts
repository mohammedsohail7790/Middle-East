/** Minimal PDF 1.4 builder for analytics reports (no external deps). */

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildContentStream(lines: string[]): string {
  const commands: string[] = ['BT'];
  let y = 750;
  for (const line of lines) {
    const size = line.startsWith('##') ? 16 : line.startsWith('#') ? 12 : 10;
    const text = line.replace(/^#+\s*/, '');
    commands.push(`/F1 ${size} Tf`);
    commands.push(`50 ${y} Td`);
    commands.push(`(${escapePdfText(text)}) Tj`);
    commands.push('0 -' + (size + 6) + ' Td');
    y -= size + 14;
    if (y < 48) break;
  }
  commands.push('ET');
  return commands.join('\n');
}

export function buildAnalyticsPdfBuffer(report: {
  title: string;
  period: string;
  kpis: { label: string; value: string }[];
  rows: { date: string; calls: number; leads: number; appointments: number }[];
}): Buffer {
  const lines: string[] = [
    `## ${report.title}`,
    `# ${report.period}`,
    '# ',
    '# Summary',
    ...report.kpis.map((k) => `${k.label}: ${k.value}`),
    '# ',
    '# Date | Calls | Leads | Appointments',
    ...report.rows.slice(0, 42).map(
      (r) =>
        `${r.date} | ${r.calls} | ${r.leads} | ${r.appointments}`
    ),
  ];
  if (report.rows.length > 42) {
    lines.push(`# … ${report.rows.length - 42} more rows in dashboard`);
  }

  const stream = buildContentStream(lines);
  const streamLength = Buffer.byteLength(stream, 'utf8');

  const parts: string[] = [];
  const offsets: number[] = [];
  const push = (s: string) => {
    offsets.push(Buffer.byteLength(parts.join(''), 'utf8'));
    parts.push(s);
  };

  parts.push('%PDF-1.4\n');

  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n'
  );
  push(
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`
  );
  push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  const xrefOffset = Buffer.byteLength(parts.join(''), 'utf8');
  const xref = ['xref\n0 6\n0000000000 65535 f \n'];
  for (let i = 0; i < 5; i++) {
    xref.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  parts.push(xref.join(''));
  parts.push(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return Buffer.from(parts.join(''), 'utf8');
}
