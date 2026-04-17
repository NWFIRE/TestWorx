import type { ReportHeaderProps } from "../types/common";
import { joinNonEmpty } from "../formatting/text";

export function ReportHeader({ company, report }: ReportHeaderProps) {
  const contactLine = joinNonEmpty([company.phone, company.email, company.website], " • ");

  return (
    <header className="pdf-header">
      <div className="pdf-header__grid">
        <div className="pdf-header__left">
          <div className="pdf-header__brand">
            {company.logoUrl ? <img alt="" className="pdf-header__logo" src={company.logoUrl} /> : <div className="pdf-header__logo-fallback" />}
            <div>
              <div className="pdf-kicker">TradeWorx document</div>
              <div className="pdf-company-name">{company.name}</div>
            </div>
          </div>
          {contactLine ? <div className="pdf-header__meta">{contactLine}</div> : null}
          {company.address ? <div className="pdf-header__meta">{company.address}</div> : null}
        </div>
        <div className="pdf-header__right">
          <div className="pdf-kicker">Customer-facing report</div>
          <div className="pdf-title">{report.title}</div>
          <div className="pdf-header__meta">
            <div>Report ID: {report.reportId}</div>
            <div>Inspection Date: {report.inspectionDate}</div>
          </div>
        </div>
      </div>
      <div className="pdf-divider" style={{ marginTop: "12px" }} />
    </header>
  );
}
