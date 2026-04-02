/**
 * VIEW: Settings & Configuration
 */
function renderSettingsView() {
  var builder = CardService.newCardBuilder();
  builder.setHeader(
    CardService.newCardHeader()
      .setTitle("Parser Engine")
      .setImageUrl(
        "https://www.gstatic.com/images/branding/product/1x/gmail_512dp.png",
      ),
  );
  builder.addSection(createTopNavBar());

  var configSection = CardService.newCardSection()
    .setHeader("Project Configuration")
    .addWidget(
      CardService.newKeyValue()
        .setTopLabel("Backend URL")
        .setContent(BACKEND_URL)
        .setMultiline(true),
    );
  builder.addSection(configSection);

  var scheduleSection = CardService.newCardSection()
    .setHeader("Auto-Sync Schedule")
    .addWidget(
      CardService.newTextParagraph().setText(
        "Set how often emails are automatically parsed. Only one schedule runs at a time.",
      ),
    )
    .addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText("⏱ Hourly")
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("setSchedule")
                .setParameters({ minutes: "60" }),
            ),
        )
        .addButton(
          CardService.newTextButton()
            .setText("🕓 Every 4h")
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("setSchedule")
                .setParameters({ minutes: "240" }),
            ),
        ),
    )
    .addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText("📅 Daily")
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("setSchedule")
                .setParameters({ minutes: "1440" }),
            ),
        )
        .addButton(
          CardService.newTextButton()
            .setText("🚫 Stop Auto-Sync")
            .setOnClickAction(
              CardService.newAction().setFunctionName("clearSchedule"),
            ),
        ),
    );
  builder.addSection(scheduleSection);

  var authSection = CardService.newCardSection()
    .setHeader("Permissions")
    .addWidget(
      CardService.newTextParagraph().setText(
        "If exports are failing, use the button below to re-authorize the spreadsheet service.",
      ),
    )
    .addWidget(
      CardService.newTextButton()
        .setText("🔑 RE-AUTHORIZE GOOGLE SHEETS")
        .setOnClickAction(
          CardService.newAction().setFunctionName("triggerAuthorization"),
        ),
    );
  builder.addSection(authSection);

  return builder.build();
}

function setSchedule(e) {
  var minutes = parseInt(e.parameters.minutes);
  // Remove existing triggers first
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "processEmails") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  // Create new trigger
  ScriptApp.newTrigger("processEmails")
    .timeBased()
    .everyMinutes(minutes)
    .create();

  var label =
    minutes === 60 ? "hourly" : minutes === 240 ? "every 4 hours" : "daily";
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText(
        "✅ Auto-sync set to " + label + "!",
      ),
    )
    .build();
}

function clearSchedule() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "processEmails") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText("🚫 Auto-sync stopped."),
    )
    .build();
}
