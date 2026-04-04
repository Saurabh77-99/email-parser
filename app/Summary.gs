/**
 * VIEW: Advanced Sync with Sender + Date Range filter
 */
function renderAdvancedSyncView() {
  var builder = CardService.newCardBuilder();
  builder.setHeader(
    CardService.newCardHeader()
      .setTitle("Parser Engine")
      .setImageUrl(
        "https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png",
      ),
  );
  builder.addSection(createTopNavBar());

  var section = CardService.newCardSection()
    .setHeader("Advanced Sync & Export")
    .addWidget(
      CardService.newTextInput()
        .setFieldName("sender_filter")
        .setTitle("From Sender (optional)")
        .setHint("e.g., rahulvshah1000@gmail.com"),
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName("from_date")
        .setTitle("From Date (optional)")
        .setHint("e.g., 2025/01/01"),
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName("to_date")
        .setTitle("To Date (optional)")
        .setHint("e.g., 2026/04/01"),
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName("rule_id")
        .setTitle("Rule ID (for export/summary)")
        .setHint("Find in Rules tab"),
    );

  var actionSection = CardService.newCardSection()
    .addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText("🔄 SYNC FILTERED")
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOnClickAction(
              CardService.newAction().setFunctionName("handleFilteredSync"),
            ),
        )
        .addButton(
          CardService.newTextButton()
            .setText("📊 EXPORT TO SHEETS")
            .setOnClickAction(
              CardService.newAction().setFunctionName("handleFilteredExport"),
            ),
        ),
    )
    .addWidget(
      CardService.newTextButton()
        .setText("📄 GENERATE SUMMARY DOC")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction().setFunctionName("handleGenerateSummaryDoc"),
        ),
    );

  builder.addSection(section);
  builder.addSection(actionSection);
  return builder.build();
}

/**
 * ACTION: Run filtered sync
 */
function handleFilteredSync(e) {
  var sender = e.formInput.sender_filter || null;
  var from = e.formInput.from_date || null;
  var to = e.formInput.to_date || null;

  var count = processEmailsFiltered(sender, from, to);
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText("✅ Synced " + count + " emails!"),
    )
    .build();
}

/**
 * ACTION: Export filtered data to Google Sheets
 */
function handleFilteredExport(e) {
  var ruleId = e.formInput.rule_id;
  var sender = e.formInput.sender_filter || "";
  var fromRaw = e.formInput.from_date || "";
  var toRaw = e.formInput.to_date || "";
  var from = fromRaw.replace(/\//g, "-");
  var to = toRaw.replace(/\//g, "-");

  if (!ruleId) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("Please enter a Rule ID."),
      )
      .build();
  }

  var url =
    BACKEND_URL +
    "/summary/" +
    ruleId +
    "?sender=" +
    encodeURIComponent(sender) +
    "&from=" +
    encodeURIComponent(from) +
    "&to=" +
    encodeURIComponent(to);

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Backend error."))
      .build();
  }

  var summary = JSON.parse(response.getContentText());
  if (!summary.data || summary.data.length === 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          "No data found for these filters.",
        ),
      )
      .build();
  }

  // Build sheet
  var ss = SpreadsheetApp.create(
    "Email Export - Rule " + ruleId + " - " + new Date().toLocaleDateString(),
  );
  var sheet = ss.getSheets()[0];

  // Collect all unique field keys
  var allKeys = new Set();
  summary.data.forEach(function (item) {
    Object.keys(item.fields).forEach(function (k) {
      allKeys.add(k);
    });
  });
  var keyArr = Array.from(allKeys);

  // Write header
  var header = ["Subject", "Sender", "Date"].concat(keyArr);
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.getRange(1, 1, 1, header.length).setFontWeight("bold");

  // Write rows
  var rows = summary.data.map(function (item) {
    var row = [item.subject || "", item.sender || "", item.createdAt || ""];
    keyArr.forEach(function (k) {
      row.push(item.fields[k] || "");
    });
    return row;
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  }

  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText(
        "✅ Exported " + rows.length + " records!",
      ),
    )
    .setOpenLink(CardService.newOpenLink().setUrl(ss.getUrl()))
    .build();
}

/**
 * ACTION: Generate Google Doc summary
 */
function handleGenerateSummaryDoc(e) {
  var ruleId = e.formInput.rule_id;
  var sender = e.formInput.sender_filter || "";
  var fromRaw = e.formInput.from_date || "";
  var toRaw = e.formInput.to_date || "";
  var from = fromRaw.replace(/\//g, "-");
  var to = toRaw.replace(/\//g, "-");

  if (!ruleId) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("Please enter a Rule ID."),
      )
      .build();
  }

  var url =
    BACKEND_URL +
    "/summary/" +
    ruleId +
    "?sender=" +
    encodeURIComponent(sender) +
    "&from=" +
    encodeURIComponent(from) +
    "&to=" +
    encodeURIComponent(to);

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var summary = JSON.parse(response.getContentText());

  if (!summary.data || summary.data.length === 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("No data found."))
      .build();
  }

  // Create Google Doc
  var userEmail = Session.getActiveUser().getEmail();
  var docTitle =
    "Summary Report - Rule " + ruleId + " - " + new Date().toLocaleDateString();
  var doc = DocumentApp.create(docTitle);
  var body = doc.getBody();

  // Header
  body
    .appendParagraph("EMAIL PARSER — SUMMARY REPORT")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Generated: " + new Date().toLocaleString());
  body.appendParagraph("User: " + userEmail);
  body.appendParagraph("Total Emails: " + summary.data.length);
  if (sender) body.appendParagraph("Sender Filter: " + sender);
  if (from || to)
    body.appendParagraph(
      "Date Range: " + (from || "Any") + " → " + (to || "Any"),
    );
  body.appendHorizontalRule();

  // Each email entry
  summary.data.forEach(function (item, idx) {
    body
      .appendParagraph(idx + 1 + ". " + (item.subject || "No Subject"))
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph("From: " + (item.sender || "Unknown"));
    body.appendParagraph("Date: " + (item.createdAt || "Unknown"));

    var fields = item.fields;
    Object.keys(fields).forEach(function (k) {
      if (!k.startsWith("attachment_")) {
        body.appendParagraph("• " + k + ": " + fields[k]);
      }
    });

    // List attachments
    var atts = Object.keys(fields).filter(function (k) {
      return k.startsWith("attachment_");
    });
    if (atts.length > 0) {
      body.appendParagraph(
        "Attachments: " +
          atts
            .map(function (k) {
              return k.replace("attachment_", "");
            })
            .join(", "),
      );
    }
    body.appendHorizontalRule();
  });

  doc.saveAndClose();

  // Convert Google Doc to PDF
  var docFile = DriveApp.getFileById(doc.getId());
  var pdfBlob = docFile.getBlob().getAs("application/pdf");
  pdfBlob.setName(docTitle + ".pdf");
  
  // Save PDF to Drive
  var pdfFile = DriveApp.createFile(pdfBlob);
  
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("📄 Summary PDF created!"))
    .setOpenLink(CardService.newOpenLink().setUrl(pdfFile.getUrl()))
    .build();
}
