function renderHomeView() {
  var builder = CardService.newCardBuilder();
  builder.setHeader(
    CardService.newCardHeader()
      .setTitle("Parser Engine")
      .setImageUrl(
        "https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png",
      ),
  );
  builder.addSection(createTopNavBar());

  // Stats
  var stats = null;
  try {
    stats = fetchFromBackend("/stats");
  } catch (e) {}
  var statsSection = CardService.newCardSection().setHeader("Stats");
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("Emails Parsed")
      .setText(stats ? String(stats.totalMessages) : "0"),
  );
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("Extractions")
      .setText(stats ? String(stats.totalExtractions) : "0"),
  );
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel("Last Sync")
      .setText(stats ? String(stats.lastSync) : "Never"),
  );
  builder.addSection(statsSection);

  // SYNC NOW button
  builder.addSection(
    CardService.newCardSection().addWidget(
      CardService.newTextButton()
        .setText("🔄 SYNC NOW")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction().setFunctionName("triggerFullSync"),
        ),
    ),
  );

  // ✨ QUICK CAPTURE — the new feature
  var quickSection = CardService.newCardSection()
    .setHeader("Quick Capture")
    .addWidget(
      CardService.newTextParagraph().setText(
        "Enter a sender's email and describe what to extract. AI will do the rest.",
      ),
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName("qc_sender")
        .setTitle("Sender email address")
        .setHint("e.g., rahulvshah1000@gmail.com"),
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName("qc_prompt")
        .setTitle("What do you want to extract?")
        .setMultiline(true)
        .setHint(
          "e.g., Extract invoice number, amount, and date from all invoices",
        ),
    )
    .addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText("📊 CAPTURE TO SHEETS")
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOnClickAction(
              CardService.newAction().setFunctionName(
                "handleQuickCaptureSheets",
              ),
            ),
        )
        .addButton(
          CardService.newTextButton()
            .setText("📄 CAPTURE TO DOC")
            .setOnClickAction(
              CardService.newAction().setFunctionName("handleQuickCaptureDoc"),
            ),
        ),
    );
  builder.addSection(quickSection);

  // Recent Activity
  var recent = null;
  try {
    recent = fetchFromBackend("/activity");
  } catch (e) {}
  var activitySection =
    CardService.newCardSection().setHeader("Recent Activity");
  if (recent && recent.length > 0) {
    recent.forEach(function (item) {
      activitySection.addWidget(
        CardService.newDecoratedText()
          .setText(item.subject || "No subject")
          .setBottomLabel(item.sender + " • " + (item.createdAt || "")),
      );
    });
  } else {
    activitySection.addWidget(
      CardService.newDecoratedText()
        .setText("No emails parsed yet.")
        .setBottomLabel("Use Quick Capture or Sync Now to get started"),
    );
  }
  builder.addSection(activitySection);
  return builder.build();
}

function renderMockDashboard() {
  return renderHomeView();
}

// ============================================================
// QUICK CAPTURE — Step 1: Sync only
// ============================================================

function handleQuickCaptureSheets(e) {
  return runQuickCaptureSync(e, "sheets");
}

function handleQuickCaptureDoc(e) {
  return runQuickCaptureSync(e, "doc");
}

function runQuickCaptureSync(e, outputType) {
  var sender = e.formInput.qc_sender;
  var prompt = e.formInput.qc_prompt;

  if (!sender || !prompt) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("⚠️ Please fill both fields."),
      )
      .build();
  }

  // Step 1 — AI generates rule
  var aiResponse = UrlFetchApp.fetch(BACKEND_URL + "/ai-generate-rule", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ prompt: prompt + " from sender: " + sender }),
    muteHttpExceptions: true,
  });

  var aiResult = JSON.parse(aiResponse.getContentText());
  if (aiResult.error) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("❌ AI Error: " + aiResult.error),
      )
      .build();
  }

  // Step 2 — Save rule with sender locked in
  var criteriaQuery = "from:" + sender;
  var saveResponse = UrlFetchApp.fetch(BACKEND_URL + "/rules", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      name: "Quick: " + sender,
      criteriaQuery: criteriaQuery,
      targetFields: aiResult.targetFields,
    }),
    muteHttpExceptions: true,
  });

  if (saveResponse.getResponseCode() !== 200) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("❌ Failed to create rule."),
      )
      .build();
  }

  // Step 3 — Find the new rule id
  var allRules = fetchFromBackend("/rules");
  var newRule = null;
  if (allRules) {
    allRules.forEach(function (r) {
      if (r.name === "Quick: " + sender && (!newRule || r.id > newRule.id))
        newRule = r;
    });
  }

  if (!newRule) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          "❌ Could not find created rule.",
        ),
      )
      .build();
  }

  // Step 4 — Sync max 10 emails only (avoid timeout)
  var threads = GmailApp.search(criteriaQuery, 0, 10);
  var count = 0;
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      if (hasLabel(message, "Parsed/Rule_" + newRule.id)) return;
      var result = ingestMessage(message, newRule.id); // use simple ingest, not rich
      if (result && result.status === "success") {
        markAsProcessed(message, newRule.id);
        count++;
      }
    });
  });

  if (count === 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          "⚠️ No emails found from " + sender,
        ),
      )
      .build();
  }

  // Step 5 — Show export card (separate step to avoid timeout)
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText(
        "✅ Synced " + count + " emails! Now choose export below.",
      ),
    )
    .setNavigation(
      CardService.newNavigation().pushCard(
        renderQuickExportCard(newRule.id, sender, outputType),
      ),
    )
    .build();
}

// ============================================================
// QUICK CAPTURE — Step 2: Export card
// ============================================================

function renderQuickExportCard(ruleId, sender, outputType) {
  var builder = CardService.newCardBuilder();
  builder.setHeader(
    CardService.newCardHeader()
      .setTitle("Quick Capture")
      .setSubtitle("Ready to export"),
  );
  builder.addSection(createTopNavBar());

  var section = CardService.newCardSection()
    .setHeader("Export Results")
    .addWidget(
      CardService.newTextParagraph().setText(
        "Emails from " + sender + " have been synced. Click below to export.",
      ),
    );

  section.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText("📊 EXPORT TO SHEETS")
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("handleQuickExportSheets")
              .setParameters({ ruleId: ruleId.toString(), sender: sender }),
          ),
      )
      .addButton(
        CardService.newTextButton()
          .setText("📄 EXPORT TO DOC")
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("handleQuickExportDoc")
              .setParameters({ ruleId: ruleId.toString(), sender: sender }),
          ),
      ),
  );

  builder.addSection(section);
  builder.addSection(createBackButton());
  return builder.build();
}

function handleQuickExportSheets(e) {
  var ruleId = e.parameters.ruleId;
  var sender = e.parameters.sender;

  var summaryResponse = UrlFetchApp.fetch(
    BACKEND_URL +
      "/summary/" +
      ruleId +
      "?sender=" +
      encodeURIComponent(sender),
    { muteHttpExceptions: true },
  );
  var summary = JSON.parse(summaryResponse.getContentText());

  if (!summary.data || summary.data.length === 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("⚠️ No data to export."),
      )
      .build();
  }

  var ss = SpreadsheetApp.create(
    "Quick Capture: " + sender + " — " + new Date().toLocaleDateString(),
  );
  var sheet = ss.getSheets()[0];

  var allKeys = [];
  summary.data.forEach(function (item) {
    Object.keys(item.fields).forEach(function (k) {
      if (
        !k.startsWith("attachment_") &&
        !k.startsWith("excel_data_") &&
        allKeys.indexOf(k) === -1
      )
        allKeys.push(k);
    });
  });

  var header = ["Subject", "Sender", "Date"].concat(allKeys);
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.getRange(1, 1, 1, header.length).setFontWeight("bold");

  var rows = summary.data.map(function (item) {
    var row = [item.subject || "", item.sender || "", item.createdAt || ""];
    allKeys.forEach(function (k) {
      row.push(item.fields[k] || "");
    });
    return row;
  });

  if (rows.length > 0)
    sheet.getRange(2, 1, rows.length, header.length).setValues(rows);

  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText(
        "✅ Exported " + rows.length + " records!",
      ),
    )
    .setOpenLink(CardService.newOpenLink().setUrl(ss.getUrl()))
    .build();
}

function handleQuickExportDoc(e) {
  var ruleId = e.parameters.ruleId;
  var sender = e.parameters.sender;

  var summaryResponse = UrlFetchApp.fetch(
    BACKEND_URL +
      "/summary/" +
      ruleId +
      "?sender=" +
      encodeURIComponent(sender),
    { muteHttpExceptions: true },
  );
  var summary = JSON.parse(summaryResponse.getContentText());

  if (!summary.data || summary.data.length === 0) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("⚠️ No data to export."),
      )
      .build();
  }

  var userEmail = Session.getActiveUser().getEmail();
  var docTitle =
    "Quick Capture: " + sender + " — " + new Date().toLocaleDateString();
  var doc = DocumentApp.create(docTitle);
  var body = doc.getBody();

  body
    .appendParagraph("QUICK CAPTURE REPORT")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Generated: " + new Date().toLocaleString());
  body.appendParagraph("User: " + userEmail);
  body.appendParagraph("Sender: " + sender);
  body.appendParagraph("Total Emails: " + summary.data.length);
  body.appendHorizontalRule();

  summary.data.forEach(function (item, idx) {
    body
      .appendParagraph(idx + 1 + ". " + (item.subject || "No Subject"))
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph("Date: " + (item.createdAt || "Unknown"));

    Object.keys(item.fields).forEach(function (k) {
      if (!k.startsWith("attachment_") && !k.startsWith("excel_data_")) {
        body.appendParagraph("• " + k + ": " + item.fields[k]);
      }
    });
    body.appendHorizontalRule();
  });

  doc.saveAndClose();

  var docFile = DriveApp.getFileById(doc.getId());
  var pdfBlob = docFile.getBlob().getAs("application/pdf");
  pdfBlob.setName(docTitle + ".pdf");
  var pdfFile = DriveApp.createFile(pdfBlob);

  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText(
        "📄 PDF created with " + summary.data.length + " emails!",
      ),
    )
    .setOpenLink(CardService.newOpenLink().setUrl(pdfFile.getUrl()))
    .build();
}
