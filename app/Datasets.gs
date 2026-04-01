/**
 * VIEW: Live Datasets Ledger
 */
function renderDatasetsView() {
  var rulesList = fetchFromBackend("/rules");
  var builder = CardService.newCardBuilder();
  
  builder.setHeader(CardService.newCardHeader()
    .setTitle("Parser Engine")
    .setImageUrl("https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png"));

  // NAV AT TOP
  builder.addSection(createTopNavBar());

  var section = CardService.newCardSection().setHeader("Categorized Ledger");
  if (rulesList && rulesList.length > 0) {
    rulesList.forEach(function(rule) {
      section.addWidget(CardService.newDecoratedText()
        .setText(rule.name)
        .setBottomLabel(rule.criteriaQuery)
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.BOOKMARK))
        .setButton(CardService.newTextButton()
          .setText("EXPORT")
          .setOnClickAction(CardService.newAction()
            .setFunctionName("exportDatasetToSheets")
            .setParameters({ruleId: rule.id.toString(), ruleName: rule.name})))
        .setOnClickAction(CardService.newAction()
          .setFunctionName("showDatasetView")
          .setParameters({ruleId: rule.id.toString(), ruleName: rule.name})));
    });
  } else {
    section.addWidget(CardService.newTextParagraph().setText("No categorized data found."));
  }

  builder.addSection(section);
  return builder.build();
}

/**
 * VIEW: Browse specific live dataset
 */
function renderDatasetDetailView(e) {
  var ruleId = e.parameters.ruleId;
  var ruleName = e.parameters.ruleName;
  var data = fetchFromBackend("/browse/" + ruleId);

  var builder = CardService.newCardBuilder();
  builder.setHeader(CardService.newCardHeader()
    .setTitle("Parser Engine")
    .setImageUrl("https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png"));

  // NAV AT TOP
  builder.addSection(createTopNavBar());

  var section = CardService.newCardSection().setHeader("Explorer: " + ruleName);
  if (data && data.length > 0) {
    data.forEach(function(item) {
      var dataStr = Object.keys(item.data).map(function(k) { return k + ": " + item.data[k]; }).join(" | ");
      section.addWidget(CardService.newDecoratedText()
        .setText(item.subject)
        .setBottomLabel(dataStr)
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION))
        .setOnClickAction(CardService.newAction()
          .setFunctionName("openEmailInGmail")
          .setParameters({messageId: item.messageId})));
    });
  } else {
    section.addWidget(CardService.newTextParagraph().setText("No records found in this dataset."));
  }

  builder.addSection(section);
  return builder.build();
}

function renderMockDatasets() { return renderDatasetsView(); }
function showDatasetView(e) { return renderDatasetDetailView(e); }

/**
 * ACTION: Export to Google Sheets
 */
function exportDatasetToSheets(e) {
  var ruleId = e.parameters.ruleId;
  var ruleName = e.parameters.ruleName;
  
  try {
    // BACKEND_URL is defined in Code.gs
    var url = BACKEND_URL + "/export/" + ruleId;
    var response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    var code = response.getResponseCode();

    if (code === 404) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("No data found for this rule to export."))
        .build();
    }

    if (code !== 200) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("Backend error (" + code + "). Please try again."))
        .build();
    }
    
    var csvData = response.getContentText();
    var rows = Utilities.parseCsv(csvData);

    if (rows.length < 2) { // Only header or empty
       return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("No records available to export."))
        .build();
    }

    // Create Spreadsheet
    var ss = SpreadsheetApp.create("Email Export: " + ruleName);
    var sheet = ss.getSheets()[0];
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Exported " + (rows.length - 1) + " records!"))
      .setOpenLink(CardService.newOpenLink().setUrl(ss.getUrl()))
      .build();

  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("System error: " + err.toString()))
      .build();
  }
}
