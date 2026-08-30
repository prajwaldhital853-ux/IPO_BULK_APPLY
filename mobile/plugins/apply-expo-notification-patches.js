/**
 * Patches expo-notifications so admin images render as BigPicture banners
 * while the app logo stays on the right. Run via postinstall and prebuild.
 */
const fs = require('fs');
const path = require('path');

const PATCH_MARKER = 'NEPSE GHAR: app logo always on right';

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

const REMOTE_CONTENT_REL_PATH = path.join(
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
  'model',
  'RemoteNotificationContent.kt',
);

const BUILDER_OLD_STYLE_LINE =
  '    builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))';

const BUILDER_OLD_LARGE_ICON_BLOCK = `    if (notificationContent.containsImage()) {
      val bitmap = notificationContent.getImage(context)
      bitmap?.let { builder.setLargeIcon(it) }
    } else {
      builder.setLargeIcon(largeIcon)
    }
    return builder.build()`;

const BUILDER_NEW_LARGE_ICON_BLOCK = `    // ${PATCH_MARKER}; admin image as big-picture banner.
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

const REMOTE_OLD_GET_IMAGE = `  override suspend fun getImage(context: Context): Bitmap? {
    val uri = remoteMessage.notification?.imageUrl
    return uri?.let { downloadImage(it) }
  }

  override fun containsImage(): Boolean {
    return remoteMessage.notification?.imageUrl != null
  }`;

const REMOTE_NEW_GET_IMAGE = `  override suspend fun getImage(context: Context): Bitmap? {
    val uri = remoteMessage.notification?.imageUrl
      ?: remoteMessage.data["image"]?.takeIf { it.isNotBlank() }?.let { android.net.Uri.parse(it) }
    return uri?.let { downloadImage(it) }
  }

  override fun containsImage(): Boolean {
    if (remoteMessage.notification?.imageUrl != null) {
      return true
    }
    return !remoteMessage.data["image"].isNullOrBlank()
  }`;

function patchFile(projectRoot, relPath, { marker, replacements }) {
  const filePath = path.join(projectRoot, relPath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`apply-expo-notification-patches: missing ${relPath}`);
  }

  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes(marker)) {
    return false;
  }

  for (const [oldBlock, newBlock] of replacements) {
    if (!src.includes(oldBlock)) {
      throw new Error(
        `apply-expo-notification-patches: unexpected content in ${relPath}`,
      );
    }
    src = src.replace(oldBlock, newBlock);
  }

  fs.writeFileSync(filePath, src);
  return true;
}

function patchExpoNotifications(projectRoot) {
  const builderPatched = patchFile(projectRoot, BUILDER_REL_PATH, {
    marker: PATCH_MARKER,
    replacements: [
      [
        BUILDER_OLD_STYLE_LINE,
        '    // Notification style set below (BigText or BigPicture).',
      ],
      [BUILDER_OLD_LARGE_ICON_BLOCK, BUILDER_NEW_LARGE_ICON_BLOCK],
    ],
  });

  const remotePatched = patchFile(projectRoot, REMOTE_CONTENT_REL_PATH, {
    marker: 'remoteMessage.data["image"]',
    replacements: [[REMOTE_OLD_GET_IMAGE, REMOTE_NEW_GET_IMAGE]],
  });

  return builderPatched || remotePatched;
}

function withNotificationBigPicture(config) {
  const { withDangerousMod } = require('expo/config-plugins');
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      patchExpoNotifications(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  const changed = patchExpoNotifications(projectRoot);
  console.log(
    changed
      ? 'Applied expo-notifications notification patches.'
      : 'expo-notifications notification patches already present.',
  );
}

module.exports = withNotificationBigPicture;
module.exports.patchExpoNotifications = patchExpoNotifications;
