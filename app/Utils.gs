/**
 * UTILS: Global Helper Functions
 */

function fetchFromBackend(path) {
  try {
    var response = UrlFetchApp.fetch(BACKEND_URL + path, {
      muteHttpExceptions: true, 
      headers: { "Accept": "application/json" }
    });
    if (response.getResponseCode() === 200) return JSON.parse(response.getContentText());
  } catch (e) {
    console.error("Fetch error for " + path + ": " + e.toString());
  }
  return null;
}

function createBackButton() {
  return CardService.newCardSection().addWidget(CardService.newTextButton()
    .setText("← Back to Dashboard")
    .setOnClickAction(CardService.newAction().setFunctionName("buildHomePage")));
}

function ingestMessage(message, ruleId) {
  try {
    var payload = {
      ruleId: ruleId, 
      messageId: message.getId(), 
      subject: message.getSubject(), 
      sender: message.getFrom(), 
      rawBody: message.getPlainBody()
    };
    var response = UrlFetchApp.fetch(BACKEND_URL + "/ingest", {
      method: 'post', 
      contentType: 'application/json', 
      payload: JSON.stringify(payload), 
      muteHttpExceptions: true
    });
    return JSON.parse(response.getContentText());
  } catch (e) { 
    return null; 
  }
}

function processEmails() {
  var rulesList = fetchFromBackend("/rules");
  if (!rulesList) return;
  rulesList.forEach(function(rule) {
    var threads = GmailApp.search(rule.criteriaQuery);
    threads.forEach(function(thread) {
      thread.getMessages().forEach(function(message) {
      if (hasLabel(message, "Processed_R" + rule.id)) return;
        var result = ingestMessage(message, rule.id);
        if (result && result.status === "success") markAsProcessed(message, rule.id);
      });
    });
  });
}

function hasLabel(message, labelName) {
  return message.getThread().getLabels().some(function(l) { return l.getName() === labelName; });
}

function markAsProcessed(message, ruleId) {
  var labelName = "Processed_R" + ruleId;
  var label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
  message.getThread().addLabel(label);
}

function triggerFullSync() {
  processEmails();
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Sync started..."))
    .build();
}

/**
 * FORCED AUTHORIZATION:
 * Returns an ActionResponse to ensure the UI handles the click properly.
 */
function triggerAuthorization() {
  try {
    // Attempting a 'create' call is the strongest way to trigger the OAuth flow
    var temp = SpreadsheetApp.create("Auth Test (Safe to Delete)");
    DriveApp.getFileById(temp.getId()).setTrashed(true); // Clean up immediately
    
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Authorization active!"))
      .build();
  } catch (e) {
    // If it fails with a permission error, Google will usually 
    // catch it and show the "Authorization Required" banner automatically.
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Permission check triggered. Please check for Gmail banners."))
      .build();
  }
}

// Rich ingest with attachments
function ingestMessageRich(message, ruleId) {
  try {
    var attachments = [];
    var atts = message.getAttachments();
    atts.forEach(function(att) {
      var mimeType = att.getContentType();
      // Only capture PDF and Excel
      if (mimeType === "application/pdf" ||
          mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          mimeType === "application/vnd.ms-excel") {
        attachments.push({
          name: att.getName(),
          mimeType: mimeType,
          data: Utilities.base64Encode(att.getBytes())
        });
      }
    });

    var payload = {
      ruleId: ruleId,
      messageId: message.getId(),
      subject: message.getSubject(),
      sender: message.getFrom(),
      rawBody: message.getPlainBody().substring(0, 5000), // limit size
      attachments: attachments
    };

    var response = UrlFetchApp.fetch(BACKEND_URL + "/ingest-rich", {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return JSON.parse(response.getContentText());
  } catch (e) {
    console.error("ingestMessageRich error: " + e.toString());
    return null;
  }
}

// Process emails with date range + sender filter support
function processEmailsFiltered(senderFilter, fromDate, toDate) {
  var rulesList = fetchFromBackend("/rules");
  if (!rulesList) return 0;
  var totalCount = 0;

  rulesList.forEach(function(rule) {
    var query = rule.criteriaQuery;
    if (senderFilter) query += " from:" + senderFilter;
    if (fromDate) query += " after:" + fromDate;
    if (toDate) query += " before:" + toDate;

    var threads = GmailApp.search(query);
    threads.forEach(function(thread) {
      thread.getMessages().forEach(function(message) {
        if (hasLabel(message, "Processed_R" + rule.id)) return;
        var result = ingestMessageRich(message, rule.id);
        if (result && result.status === "success") {
          markAsProcessed(message, rule.id);
          totalCount++;
        }
      });
    });
  });
  return totalCount;
}

function processEmails() {
  processEmailsFiltered(null, null, null);
}

function hasLabel(message, labelName) {
  return message.getThread().getLabels().some(function(l) { return l.getName() === labelName; });
}

function markAsProcessed(message) {
  var labelName = "Processed";
  var label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
  message.getThread().addLabel(label);
}

function triggerFullSync() {
  var count = processEmailsFiltered(null, null, null);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("✅ Synced " + count + " emails!"))
    .build();
}

function fetchFromBackend(path) {
  try {
    var response = UrlFetchApp.fetch(BACKEND_URL + path, {
      muteHttpExceptions: true,
      headers: { "Accept": "application/json" }
    });
    if (response.getResponseCode() === 200) return JSON.parse(response.getContentText());
  } catch (e) {
    console.error("Fetch error for " + path + ": " + e.toString());
  }
  return null;
}

function createBackButton() {
  return CardService.newCardSection().addWidget(CardService.newTextButton()
    .setText("← Back to Dashboard")
    .setOnClickAction(CardService.newAction().setFunctionName("buildHomePage")));
}

function ingestMessage(message, ruleId) {
  return ingestMessageRich(message, ruleId);
}

function triggerAuthorization() {
  try {
    var temp = SpreadsheetApp.create("Auth Test (Safe to Delete)");
    DriveApp.getFileById(temp.getId()).setTrashed(true);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Authorization active!")).build();
  } catch (e) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Permission check triggered.")).build();
  }
}
