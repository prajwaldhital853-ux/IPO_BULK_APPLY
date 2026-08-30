const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BUILDER_REL_PATH = path.join(
  'node_modules',
  'expo-notifications',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'notifications',
  'notifications',
  'presentation',
  'builders',
  'ExpoNotificationBuilder.kt',
);

const PATCH_MARKER = 'NEPSE GHAR: app logo always on right';

const OLD_STYLE_LINE =
  '    builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))';

const OLD_LARGE_ICON_BLOCK = `    if (notificationContent.containsImage()) {
      val bitmap = notificationContent.getImage(context)
      bitmap?.let { builder.setLargeIcon(it) }
    } else {
      builder.setLargeIcon(largeIcon)
    }
    return builder.build()`;

const NEW_LARGE_ICON_BLOCK = `    // ${PATCH_MARKER}; admin image as big-picture banner.
    largeIcon?.let { builder.setLargeIcon(it) }

    if (notificationContent.containsImage()) {
      val bitmap = notificationContent.getImage(context)
      if (bitmap != null) {
        builder.setStyle(
          NotificationCompat.BigPictureStyle()
            .bigPicture(bitmap)
            .setBigContentTitle(content.title)
            .setSummaryText(content.text)
            .bigLargeIcon(null as Bitmap?)
        )
      } else {
        builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))
      }
    } else {
      builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))
    }
    return builder.build()`;

function patchExpoNotificationBuilder(projectRoot) {
  const filePath = path.join(projectRoot, BUILDER_REL_PATH);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `withNotificationBigPicture: ExpoNotificationBuilder.kt not found at ${filePath}`,
    );
  }

  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes(PATCH_MARKER)) {
    return;
  }

  if (!src.includes(OLD_STYLE_LINE)) {
    throw new Error(
      'withNotificationBigPicture: unexpected ExpoNotificationBuilder.kt (style line)',
    );
  }
  if (!src.includes(OLD_LARGE_ICON_BLOCK)) {
    throw new Error(
      'withNotificationBigPicture: unexpected ExpoNotificationBuilder.kt (large icon block)',
    );
  }

  src = src.replace(
    OLD_STYLE_LINE,
    '    // Notification style set below (BigText or BigPicture).',
  );
  src = src.replace(OLD_LARGE_ICON_BLOCK, NEW_LARGE_ICON_BLOCK);
  fs.writeFileSync(filePath, src);
}

function withNotificationBigPicture(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      patchExpoNotificationBuilder(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);
}

module.exports = withNotificationBigPicture;
