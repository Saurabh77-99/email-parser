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
 * VIEW: AI-Powered Create Rule Form
 */
function renderCreateRuleView() {
  var builder = CardService.newCardBuilder();
  builder.setHeader(
    CardService.newCardHeader()
      .setTitle("AI Rule Creator")
      .setSubtitle("Powered by Gemini - Just describe what you want!"),
  );

  builder.addSection(createTopNavBar());

  var section = CardService.newCardSection()
    .setHeader("Describe your rule")
    .addWidget(
      CardService.newTextInput()
        .setFieldName("ai_prompt")
        .setTitle("What do you want to extract?")
        .setMultiline(true)
        .setHint("e.g., Find all invoices from Amazon and extract the order ID, total amount, and date.")
    )
    .addWidget(
      CardService.newTextParagraph()
        .setText("The AI will automatically figure out the Gmail search query and the exact data patterns to extract.")
    );

  var btnSection = CardService.newCardSection();
  btnSection.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText("🪄 GENERATE & SAVE RULE")
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOnClickAction(
            CardService.newAction().setFunctionName("handleAiRuleCreate"),
          ),
      )
      .addButton(
        CardService.newTextButton()
          .setText("Cancel")
          .setOnClickAction(
            CardService.newAction().setFunctionName("renderRulesView"),
          ),
      ),
  );
  
  builder.addSection(section);
  builder.addSection(btnSection);
  builder.addSection(createBackButton());

  return builder.build();
}

/**
 * ACTION: Handle AI Rule Creation
 */
function handleAiRuleCreate(e) {
  var prompt = e.formInput.ai_prompt;
  
  if (!prompt || prompt.length < 5) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("❌ Please describe what you want to extract."),
      )
      .build();
  }

  try {
    // 1. Ask Gemini to generate the rule config
    var aiResponse = UrlFetchApp.fetch(BACKEND_URL + "/ai-generate-rule", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ prompt: prompt }),
      muteHttpExceptions: true
    });

    var aiResult = JSON.parse(aiResponse.getContentText());

    if (aiResult.error) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText("❌ AI Error: " + aiResult.error),
        )
        .build();
    }

    // 2. Save the generated rule to the backend
    var saveResponse = UrlFetchApp.fetch(BACKEND_URL + "/rules", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        name: aiResult.name,
        criteriaQuery: aiResult.criteriaQuery,
        targetFields: aiResult.targetFields
      }),
      muteHttpExceptions: true
    });

    if (saveResponse.getResponseCode() === 200) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText("✅ AI Rule '" + aiResult.name + "' created!"),
        )
        .setNavigation(
          CardService.newNavigation().updateCard(renderRulesView()),
        )
        .build();
    } else {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText("❌ Failed to save AI rule."),
        )
        .build();
    }
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText("System error: " + err.toString()),
      )
      .build();
  }
}

/**
 * ACTION: Delete Rule
 */
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

/**
 * ACTION: Run Single Rule
 */
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
        // Use per-rule label to avoid conflicts
        if (hasLabel(message, "Processed_R" + ruleId)) return;
        var result = ingestMessage(message, ruleId);
        if (result && result.status === "success") {
          markAsProcessed(message, ruleId);
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

/**
 * HELPER: Parse "Label: Example" into regex object
 */
function parseCustomField(input, targetFields) {
  if (input && input.includes(":")) {
    var parts = input.split(":");
    var key = parts[0].trim().toLowerCase().replace(/\s+/g, "_");
    var label = parts[0].trim();
    targetFields[key] = label + ":\\s*(.+)";
  }
}

function renderMockRules() {
  return renderRulesView();
}