import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { CardsScreen } from "../../src/features/statements/CardsScreen";

const statementFileInput = () => screen.getByLabelText(/Statement.*file/i);

function bofaQboFixture() {
  return [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "",
    "<OFX>",
    "  <CREDITCARDMSGSRSV1>",
    "    <CCSTMTTRNRS>",
    "      <CCSTMTRS>",
    "        <CURDEF>USD",
    "        <CCACCTFROM><ACCTID>XXXXXXXXXXXX8055</CCACCTFROM>",
    "        <BANKTRANLIST>",
    "          <STMTTRN>",
    "            <TRNTYPE>CREDIT",
    "            <DTPOSTED>20260521120000.000",
    "            <DTUSER>20260520120000.000",
    "            <TRNAMT>4364.96",
    "            <FITID>payment-1",
    "            <NAME>Payment - Thank you",
    "          </STMTTRN>",
    "          <STMTTRN>",
    "            <TRNTYPE>DEBIT",
    "            <DTPOSTED>20260518120000.000",
    "            <DTUSER>20260515120000.000",
    "            <TRNAMT>-80.62",
    "            <FITID>uber-1",
    "            <NAME>UBER *TRIP",
    "          </STMTTRN>",
    "        </BANKTRANLIST>",
    "      </CCSTMTRS>",
    "    </CCSTMTTRNRS>",
    "  </CREDITCARDMSGSRSV1>",
    "</OFX>"
  ].join("\n");
}

async function bofaXlsxFixture() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types />");
  zip.file("xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><workbook />");
  zip.file(
    "xl/worksheets/sheet1.xml",
    [
      "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
      "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">",
      "<sheetData>",
      "<row r=\"1\">",
      "<c r=\"A1\" t=\"str\"><v>Posted date</v></c>",
      "<c r=\"B1\" t=\"str\"><v> Transaction date</v></c>",
      "<c r=\"C1\" t=\"str\"><v> Merchant name</v></c>",
      "<c r=\"D1\" t=\"str\"><v> Merchant city</v></c>",
      "<c r=\"K1\" t=\"str\"><v> Original amount</v></c>",
      "<c r=\"L1\" t=\"str\"><v> Currency</v></c>",
      "<c r=\"M1\" t=\"str\"><v> Conversion rate</v></c>",
      "<c r=\"N1\" t=\"str\"><v> Billed amount</v></c>",
      "<c r=\"O1\" t=\"str\"><v> Debit/credit</v></c>",
      "</row>",
      "<row r=\"2\">",
      "<c r=\"A2\" t=\"str\"><v>2026-05-21</v></c>",
      "<c r=\"B2\" t=\"str\"><v>2026-05-20</v></c>",
      "<c r=\"C2\" t=\"str\"><v>Payment - Thank you</v></c>",
      "<c r=\"K2\" t=\"str\"><v>-4364.96</v></c>",
      "<c r=\"L2\" t=\"str\"><v>USD</v></c>",
      "<c r=\"M2\" t=\"str\"><v>1</v></c>",
      "<c r=\"N2\" t=\"str\"><v>-4364.96</v></c>",
      "<c r=\"O2\" t=\"str\"><v>Credit</v></c>",
      "</row>",
      "<row r=\"3\">",
      "<c r=\"A3\" t=\"str\"><v>2026-05-19</v></c>",
      "<c r=\"B3\" t=\"str\"><v>2026-05-18</v></c>",
      "<c r=\"C3\" t=\"str\"><v>EXXON BUCKY&apos;S STORE 53</v></c>",
      "<c r=\"D3\" t=\"str\"><v>NAPERVILLE</v></c>",
      "<c r=\"K3\" t=\"str\"><v>73.63</v></c>",
      "<c r=\"L3\" t=\"str\"><v>USD</v></c>",
      "<c r=\"M3\" t=\"str\"><v>1</v></c>",
      "<c r=\"N3\" t=\"str\"><v>73.63</v></c>",
      "<c r=\"O3\" t=\"str\"><v>Debit</v></c>",
      "</row>",
      "</sheetData>",
      "</worksheet>"
    ].join("")
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("CardsScreen", () => {
  it("shows malformed statement upload errors without importing charges", async () => {
    const user = userEvent.setup();
    const onStatementImported = vi.fn();
    const malformedCsv = ['Transaction Date,Description,Amount', '"2026-05-21,TAXI PARISIEN,42'].join("\n");

    render(<CardsScreen onBack={() => undefined} onStatementImported={onStatementImported} />);

    await user.upload(
      statementFileInput(),
      new File([malformedCsv], "bad-statement.csv", { type: "text/csv" })
    );

    expect(await screen.findByText(/Statement CSV import failed/i)).toBeInTheDocument();
    expect(onStatementImported).not.toHaveBeenCalled();
  });

  it("imports Bank of America QBO statement charges and skips payment credits", async () => {
    const user = userEvent.setup();
    const onStatementImported = vi.fn();

    render(<CardsScreen cardLabel="BofA GlobalCard" onBack={() => undefined} onStatementImported={onStatementImported} />);

    await user.upload(
      statementFileInput(),
      new File([bofaQboFixture()], "May2026.QBO", { type: "application/vnd.intu.qbo" })
    );

    expect(await screen.findByText("1 charges imported.")).toBeInTheDocument();
    expect(onStatementImported).toHaveBeenCalledWith([
      expect.objectContaining({
        cardLabel: "BofA GlobalCard",
        transactionDate: "2026-05-15",
        postedDate: "2026-05-18",
        description: "UBER *TRIP",
        originalAmount: 80.62,
        originalCurrency: "USD",
        finalUsdAmount: 80.62,
        matchStatus: "Unmatched"
      })
    ]);
  });

  it("imports Bank of America XLSX statement charges and skips payment credits", async () => {
    const user = userEvent.setup();
    const onStatementImported = vi.fn();
    const workbook = await bofaXlsxFixture();

    render(<CardsScreen cardLabel="BofA GlobalCard" onBack={() => undefined} onStatementImported={onStatementImported} />);

    await user.upload(
      statementFileInput(),
      new File([workbook], "BOfA GlobalCard-May 2026.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
    );

    expect(await screen.findByText("1 charges imported.")).toBeInTheDocument();
    expect(onStatementImported).toHaveBeenCalledWith([
      expect.objectContaining({
        cardLabel: "BofA GlobalCard",
        transactionDate: "2026-05-18",
        postedDate: "2026-05-19",
        description: "EXXON BUCKY'S STORE 53",
        merchantCity: "NAPERVILLE",
        merchantCountry: "United States",
        originalAmount: 73.63,
        originalCurrency: "USD",
        finalUsdAmount: 73.63,
        matchStatus: "Unmatched"
      })
    ]);
  });
});
