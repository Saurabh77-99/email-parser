// ============================================================
// CORE FETCH
// ============================================================

function fetchFromBackend(path) {
  try {
    var response = UrlFetchApp.fetch(BACKEND_URL + path, {
      muteHttpExceptions: true,
      headers: { Accept: "application/json" },
    });
    if (response.getResponseCode() === 200)
      return JSON.parse(response.getContentText());
    console.error(
      "Backend error " + response.getResponseCode() + " for " + path,
    );
  } catch (e) {
    console.error("Fetch error for " + path + ": " + e.toString());
  }
  return null;
}

function createBackButton() {
  return CardService.newCardSection().addWidget(
    CardService.newTextButton()
      .setText("← Back to Dashboard")
      .setOnClickAction(
        CardService.newAction().setFunctionName("buildHomePage"),
      ),
  );
}

// ============================================================
// LABEL HELPERS (per-rule so same email works in multiple rules)
// ============================================================

function hasLabel(message, labelName) {
  return message
    .getThread()
    .getLabels()
    .some(function (l) {
      return l.getName() === labelName;
    });
}

function markAsProcessed(message, ruleId) {
  var labelName = "Parsed/Rule_" + ruleId;
  var label =
    GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
  message.getThread().addLabel(label);
}

function resetProcessedLabel() {
  // Removes ALL Parsed/Rule_* labels from all threads
  GmailApp.getUserLabels().forEach(function (label) {
    if (label.getName().indexOf("Parsed/Rule_") === 0) {
      label.getThreads().forEach(function (thread) {
        thread.removeLabel(label);
      });
      console.log("Reset label: " + label.getName());
    }
  });
  console.log("All rule labels reset.");
}

// ============================================================
// INGEST — Simple (body only)
// ============================================================

function ingestMessage(message, ruleId) {
  try {
    var payload = {
      ruleId: ruleId,
      messageId: message.getId(),
      subject: message.getSubject(),
      sender: message.getFrom(),
      rawBody: message.getPlainBody().substring(0, 5000),
    };
    var response = UrlFetchApp.fetch(BACKEND_URL + "/ingest", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    return JSON.parse(response.getContentText());
  } catch (e) {
    console.error("ingestMessage error: " + e.toString());
    return null;
  }
}

// ============================================================
// INGEST — Rich (body + PDF/Excel attachments)
// ============================================================

function ingestMessageRich(message, ruleId) {
  try {
    var attachments = [];
    message.getAttachments().forEach(function (att) {
      var mimeType = att.getContentType();
      if (
        mimeType === "application/pdf" ||
        mimeType ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mimeType === "application/vnd.ms-excel"
      ) {
        var attObj = {
          name: att.getName(),
          mimeType: mimeType,
          data: Utilities.base64Encode(att.getBytes()),
          isExcel: mimeType !== "application/pdf",
        };
        if (attObj.isExcel) {
          console.log("Extracting Excel: " + att.getName());
          var extracted = extractExcelContent(attObj.data, attObj.name);
          if (extracted) attObj.extractedText = extracted;
        } else if (mimeType === "application/pdf") {
          console.log("Extracting PDF: " + att.getName());
          var pdfText = extractPdfContent(attObj.data, attObj.name);
          if (pdfText) attObj.extractedText = pdfText;
        }
        attachments.push(attObj);
      }
    });

    var payload = {
      ruleId: ruleId,
      messageId: message.getId(),
      subject: message.getSubject(),
      sender: message.getFrom(),
      rawBody: message.getPlainBody().substring(0, 5000),
      attachments: attachments,
    };

    var response = UrlFetchApp.fetch(BACKEND_URL + "/ingest-rich", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    return JSON.parse(response.getContentText());
  } catch (e) {
    console.error("ingestMessageRich error: " + e.toString());
    return null;
  }
}

// ============================================================
// EXCEL EXTRACTION — converts to Google Sheet, reads text
// ============================================================

function extractExcelContent(base64Data, fileName) {
  try {
    var blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName,
    );
    var tempFile = DriveApp.createFile(blob);
    Utilities.sleep(2000);

    var sheetFile = Drive.Files.copy(
      { mimeType: "application/vnd.google-apps.spreadsheet" },
      tempFile.getId(),
    );
    var sheet = SpreadsheetApp.openById(sheetFile.id).getSheets()[0];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var textContent = "";

    if (lastRow > 0 && lastCol > 0) {
      sheet
        .getRange(1, 1, lastRow, lastCol)
        .getValues()
        .forEach(function (row) {
          var rowText = row
            .filter(function (c) {
              return c !== "";
            })
            .join(" | ");
          if (rowText) textContent += rowText + "\n";
        });
    }

    DriveApp.getFileById(sheetFile.id).setTrashed(true);
    DriveApp.getFileById(tempFile.getId()).setTrashed(true);
    console.log(
      "Excel extracted: " + fileName + " (" + textContent.length + " chars)",
    );
    return textContent.trim();
  } catch (e) {
    console.error(
      "Excel extraction failed for " + fileName + ": " + e.toString(),
    );
    return "";
  }
}

// ============================================================
// PDF EXTRACTION — converts to Google Doc via OCR, reads text
// ============================================================

function extractPdfContent(base64Data, fileName) {
  try {
    var blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      "application/pdf",
      fileName,
    );
    var tempFile = DriveApp.createFile(blob);
    Utilities.sleep(2000);

    // Convert PDF → Google Doc with OCR
    var docFile = Drive.Files.copy(
      {
        mimeType: "application/vnd.google-apps.document",
        title: fileName + "_ocr",
      },
      tempFile.getId(),
      { ocr: true },
    );

    var doc = DocumentApp.openById(docFile.id);
    var text = doc.getBody().getText();

    // Cleanup temp files
    DriveApp.getFileById(docFile.id).setTrashed(true);
    DriveApp.getFileById(tempFile.getId()).setTrashed(true);

    console.log("PDF extracted: " + fileName + " (" + text.length + " chars)");
    return text.trim();
  } catch (e) {
    console.error(
      "PDF extraction failed for " + fileName + ": " + e.toString(),
    );
    return "";
  }
}

// ============================================================
// SYNC — Process all rules or filtered
// ============================================================

function processEmails() {
  return processEmailsFiltered(null, null, null);
}

function processEmailsFiltered(senderFilter, fromDate, toDate) {
  var rulesList = fetchFromBackend("/rules");
  if (!rulesList) {
    console.error("No rules found.");
    return 0;
  }

  var totalCount = 0;

  rulesList.forEach(function (rule) {
    if (!rule.isActive) {
      console.log("⏸ Skipping inactive rule [" + rule.id + "]: " + rule.name);
      return;
    }
    var query = rule.criteriaQuery;
    if (senderFilter) query += " from:" + senderFilter;
    if (fromDate) query += " after:" + fromDate;
    if (toDate) query += " before:" + toDate;

    console.log(
      "Syncing rule [" + rule.id + "] " + rule.name + " | Query: " + query,
    );
    var threads = GmailApp.search(query);
    console.log("Found " + threads.length + " threads");

    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        var labelName = "Parsed/Rule_" + rule.id;
        if (hasLabel(message, labelName)) return; // already processed for this rule

        var result = ingestMessageRich(message, rule.id);
        if (result && result.status === "success") {
          markAsProcessed(message, rule.id);
          totalCount++;
          console.log(
            "✅ Ingested: " +
              message.getSubject() +
              " → rule " +
              rule.id +
              " | extracted: " +
              result.extracted,
          );
        } else {
          console.error(
            "❌ Failed: " +
              message.getSubject() +
              " → " +
              JSON.stringify(result),
          );
        }
      });
    });
  });

  console.log("Sync complete. Total ingested: " + totalCount);
  return totalCount;
}

// ============================================================
// UI ACTIONS
// ============================================================

function triggerFullSync() {
  var count = processEmailsFiltered(null, null, null);
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText(
        "✅ Synced " + count + " new emails!",
      ),
    )
    .build();
}

function triggerAuthorization() {
  try {
    var temp = SpreadsheetApp.create("Auth Test (Safe to Delete)");
    DriveApp.getFileById(temp.getId()).setTrashed(true);
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("✅ Authorization active!"),
      )
      .build();
  } catch (e) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          "⚠️ Check Gmail for authorization banner.",
        ),
      )
      .build();
  }
}

// ============================================================
// DEBUG HELPERS (safe to keep, only run manually)
// ============================================================

function debugSync() {
  var rulesList = fetchFromBackend("/rules");
  if (!rulesList) {
    console.log("No rules.");
    return;
  }

  rulesList.forEach(function (rule) {
    console.log(
      "Rule [" + rule.id + "]: " + rule.name + " | " + rule.criteriaQuery,
    );
    var threads = GmailApp.search(rule.criteriaQuery);
    console.log("Threads: " + threads.length);
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        var processed = hasLabel(message, "Parsed/Rule_" + rule.id);
        console.log(
          "  " +
            (processed ? "✅ DONE" : "🔲 NEW") +
            " | " +
            message.getSubject(),
        );
      });
    });
  });
}
