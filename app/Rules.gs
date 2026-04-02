/**
 * VIEW: Live Rule Management
 */
function renderRulesView() {
  var rulesList = fetchFromBackend("/rules");
  var builder = CardService.newCardBuilder();

  builder.setHeader(
    CardService.newCardHeader()
      .setTitle("Parser Engine")
      .setImageUrl(
        "https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png",
      ),
  );

  // NAV AT TOP
  builder.addSection(createTopNavBar());

  var section = CardService.newCardSection().setHeader("Configured Rules");

  if (rulesList && rulesList.length > 0) {
    rulesList.forEach(function (rule) {
      var status = rule.isActive ? "✅ ACTIVE" : "⏸ PAUSED";
      section.addWidget(
        CardService.newDecoratedText()
          .setText(rule.name)
          .setBottomLabel("Query: " + rule.criteriaQuery)
          .setTopLabel(status)
          .setStartIcon(
            CardService.newIconImage().setIcon(CardService.Icon.DESCRIPTION),
          )
          .setButton(
            CardService.newTextButton()
              .setText("▶ RUN")
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName("runSingleRule")
                  .setParameters({
                    ruleId: rule.id.toString(),
                    ruleName: rule.name,
                  }),
              ),
          ),
      );

      section.addWidget(
        CardService.newTextButton()
          .setText('🗑 DELETE "' + rule.name + '"')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName("handleDeleteRule")
              .setParameters({ ruleId: rule.id.toString() }),
          ),
      );

      section.addWidget(CardService.newDivider());
    });
  } else {
    section.addWidget(
      CardService.newTextParagraph().setText("No rules configured."),
    );
  }

  var actionSection = CardService.newCardSection().addWidget(
    CardService.newTextButton()
      .setText("➕ CREATE NEW RULE")
      .setOnClickAction(
        CardService.newAction().setFunctionName("renderCreateRuleView"),
      ),
  );

  builder.addSection(section);
  builder.addSection(actionSection);

  return builder.build();
}

/**
 * VIEW: Create Rule Form
 */
function renderCreateRuleView() {
  var builder = CardService.newCardBuilder();
  builder.setHeader(
    CardService.newCardHeader()
      .setTitle("New Rule")
      .setSubtitle("Define extraction parameters"),
  );

  var section = CardService.newCardSection()
    .addWidget(
      CardService.newTextInput()
        .setFieldName("rule_name")
        .setTitle("Friendly Name")
        .setHint("e.g., Monthly Uber Export"),
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName("criteria_query")
        .setTitle("Gmail Search Query")
        .setHint("e.g., label:Invoices after:2024/01/01"),
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName("target_fields")
        .setTitle("Extraction Schema (JSON)")
        .setMultiline(true)
        .setHint('{"Price": "Price:\\\\s*(\\\\d+)"}'),
    );

  var actionSection = CardService.newCardSection().addWidget(
    CardService.newTextButton()
      .setText("SAVE RULE")
      .setOnClickAction(
        CardService.newAction().setFunctionName("handleCreateRule"),
      ),
  );

  builder.addSection(section);
  builder.addSection(actionSection);
  builder.addSection(createBackButton());

  return builder.build();
}

/**
 * ACTION: Save Rule to Backend
 */
function handleCreateRule(e) {
  var name = e.formInput.rule_name;
  var criteriaQuery = e.formInput.criteria_query;
  var targetFields = e.formInput.target_fields;

  if (!name || !criteriaQuery || !targetFields) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("Please fill all fields."),
      )
      .build();
  }

  try {
    var payload = {
      name: name,
      criteriaQuery: criteriaQuery,
      targetFields: targetFields,
    };

    var response = UrlFetchApp.fetch(BACKEND_URL + "/rules", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() === 200) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText("Rule created successfully!"),
        )
        .setNavigation(
          CardService.newNavigation().updateCard(renderRulesView()),
        )
        .build();
    } else {
      var error = JSON.parse(response.getContentText());
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(
            "Error: " + (error.error || "Failed to save"),
          ),
        )
        .build();
    }
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          "System error: " + err.toString(),
        ),
      )
      .build();
  }
}

function handleDeleteRule(e) {
  var ruleId = e.parameters.ruleId;
  try {
    var response = UrlFetchApp.fetch(BACKEND_URL + "/rules/" + ruleId, {
      method: "delete",
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() === 200) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText("Rule deleted."))
        .setNavigation(
          CardService.newNavigation().updateCard(renderRulesView()),
        )
        .build();
    }
  } catch (err) {}
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText("Failed to delete rule."),
    )
    .build();
}

function runSingleRule(e) {
  var ruleId = parseInt(e.parameters.ruleId);
  var ruleName = e.parameters.ruleName;
  try {
    var rule = fetchFromBackend("/rules");
    var matched = rule
      ? rule.find(function (r) {
          return r.id === ruleId;
        })
      : null;
    if (!matched) throw new Error("Rule not found");

    var threads = GmailApp.search(matched.criteriaQuery);
    var count = 0;
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        if (hasLabel(message, "Processed")) return;
        var result = ingestMessage(message, ruleId);
        if (result && result.status === "success") {
          markAsProcessed(message);
          count++;
        }
      });
    });
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          "✅ Synced " + count + " emails for: " + ruleName,
        ),
      )
      .setNavigation(CardService.newNavigation().updateCard(renderHomeView()))
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("Error: " + err.toString()),
      )
      .build();
  }
}

function renderMockRules() {
  return renderRulesView();
}
