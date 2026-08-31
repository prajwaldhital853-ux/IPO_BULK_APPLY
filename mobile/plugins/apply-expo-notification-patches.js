/**
 * Patches expo-notifications so admin images render as BigPicture banners
 * (title on top, image in middle, body below) while the app logo stays on the right.
 */
const fs = require('fs');
const path = require('path');

const BUILDER_V2_MARKER = 'NEPSE GHAR v2';
const BUILDER_V3_MARKER = 'NEPSE GHAR v3';
const BUILDER_V1_MARKER = 'NEPSE GHAR: app logo always on right';
const REMOTE_V2_MARKER = 'parsedBodyJson()';
const REMOTE_V4_MARKER = 'NEPSE GHAR remote v4';

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

const BUILDER_STOCK_STYLE_LINE =
  '    builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))';

const BUILDER_STOCK_LARGE_ICON_BLOCK = `    if (notificationContent.containsImage()) {
      val bitmap = notificationContent.getImage(context)
      bitmap?.let { builder.setLargeIcon(it) }
    } else {
      builder.setLargeIcon(largeIcon)
    }
    return builder.build()`;

const BUILDER_V1_BLOCK = `    // ${BUILDER_V1_MARKER}; admin image as big-picture banner.
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

const BUILDER_V2_BLOCK = `    // ${BUILDER_V2_MARKER}: title top, image middle, body below (SS2 layout).
    largeIcon?.let { builder.setLargeIcon(it) }

    if (notificationContent.containsImage()) {
      val bitmap = notificationContent.getImage(context)
      if (bitmap != null) {
        val titleText = content.title?.takeIf { it.isNotBlank() } ?: ""
        val bodyText = content.text?.takeIf { it.isNotBlank() } ?: ""
        builder.setContentTitle(titleText)
        builder.setContentText(bodyText)
        val pictureStyle = NotificationCompat.BigPictureStyle()
          .bigPicture(bitmap)
          .setBigContentTitle(titleText)
          .setSummaryText(bodyText)
          .bigLargeIcon(null as Bitmap?)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          pictureStyle.showBigPictureWhenCollapsed(false)
        }
        builder.setStyle(pictureStyle)
      } else {
        builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))
      }
    } else {
      builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))
    }
    return builder.build()`;

const BUILDER_V3_BLOCK = `    // ${BUILDER_V3_MARKER}: image in middle (no right logo); logo only when no image.
    if (notificationContent.containsImage()) {
      val bitmap = notificationContent.getImage(context)
      if (bitmap != null) {
        val titleText = content.title?.takeIf { it.isNotBlank() } ?: ""
        val bodyText = content.text?.takeIf { it.isNotBlank() } ?: ""
        builder.setContentTitle(titleText)
        builder.setContentText(bodyText)
        val pictureStyle = NotificationCompat.BigPictureStyle()
          .bigPicture(bitmap)
          .setBigContentTitle(titleText)
          .setSummaryText(bodyText)
          .bigLargeIcon(null as Bitmap?)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          pictureStyle.showBigPictureWhenCollapsed(false)
        }
        builder.setStyle(pictureStyle)
      } else {
        largeIcon?.let { builder.setLargeIcon(it) }
        builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))
      }
    } else {
      largeIcon?.let { builder.setLargeIcon(it) }
      builder.setStyle(NotificationCompat.BigTextStyle().bigText(content.text))
    }
    return builder.build()`;

const REMOTE_STOCK_GET_IMAGE = `  override suspend fun getImage(context: Context): Bitmap? {
    val uri = remoteMessage.notification?.imageUrl
    return uri?.let { downloadImage(it) }
  }

  override fun containsImage(): Boolean {
    return remoteMessage.notification?.imageUrl != null
  }

  override val title = remoteMessage.notification?.title ?: notificationData.title

  override val text = remoteMessage.notification?.body ?: notificationData.message`;

const REMOTE_V1_GET_IMAGE = `  override suspend fun getImage(context: Context): Bitmap? {
    val uri = remoteMessage.notification?.imageUrl
      ?: remoteMessage.data["image"]?.takeIf { it.isNotBlank() }?.let { android.net.Uri.parse(it) }
    return uri?.let { downloadImage(it) }
  }

  override fun containsImage(): Boolean {
    if (remoteMessage.notification?.imageUrl != null) {
      return true
    }
    return !remoteMessage.data["image"].isNullOrBlank()
  }

  override val title = remoteMessage.notification?.title ?: notificationData.title

  override val text = remoteMessage.notification?.body ?: notificationData.message`;

const REMOTE_V2_BLOCK = `  private fun parsedBodyJson() = notificationData.body

  override suspend fun getImage(context: Context): Bitmap? {
    val uri = remoteMessage.notification?.imageUrl
      ?: remoteMessage.data["image"]?.takeIf { it.isNotBlank() }?.let { android.net.Uri.parse(it) }
    return uri?.let { downloadImage(it) }
  }

  override fun containsImage(): Boolean {
    if (remoteMessage.notification?.imageUrl != null) {
      return true
    }
    return !remoteMessage.data["image"].isNullOrBlank()
  }

  override val title = remoteMessage.notification?.title
    ?: notificationData.title
    ?: parsedBodyJson()?.optString("title")?.takeIf { it.isNotBlank() }
    ?: remoteMessage.data["title"]?.takeIf { it.isNotBlank() }

  override val text = remoteMessage.notification?.body
    ?: notificationData.message
    ?: parsedBodyJson()?.optString("message")?.takeIf { it.isNotBlank() }
    ?: parsedBodyJson()?.optString("body")?.takeIf { it.isNotBlank() }
    ?: remoteMessage.data["body"]?.takeIf { it.isNotBlank() && !it.startsWith("{") }`;

const REMOTE_V3_BLOCK = `  private fun parsedBodyJson() = notificationData.body

  override suspend fun getImage(context: Context): Bitmap? {
    val uri = remoteMessage.data["image"]?.takeIf { it.isNotBlank() }?.let { android.net.Uri.parse(it) }
    return uri?.let { downloadImage(it) }
  }

  override fun containsImage(): Boolean {
    return !remoteMessage.data["image"].isNullOrBlank()
  }

  override val title = remoteMessage.notification?.title
    ?: notificationData.title
    ?: parsedBodyJson()?.optString("title")?.takeIf { it.isNotBlank() }
    ?: remoteMessage.data["title"]?.takeIf { it.isNotBlank() }

  override val text = remoteMessage.notification?.body
    ?: notificationData.message
    ?: parsedBodyJson()?.optString("message")?.takeIf { it.isNotBlank() }
    ?: parsedBodyJson()?.optString("body")?.takeIf { it.isNotBlank() }
    ?: remoteMessage.data["body"]?.takeIf { it.isNotBlank() && !it.startsWith("{") }`;

const REMOTE_V4_BLOCK = `  private fun parsedBodyJson() = notificationData.body

  // ${REMOTE_V4_MARKER}: richContent imageUrl + data.image for BigPicture in foreground.
  override suspend fun getImage(context: Context): Bitmap? {
    val uri = remoteMessage.notification?.imageUrl
      ?: remoteMessage.data["image"]?.takeIf { it.isNotBlank() }?.let { android.net.Uri.parse(it) }
    return uri?.let { downloadImage(it) }
  }

  override fun containsImage(): Boolean {
    if (remoteMessage.notification?.imageUrl != null) {
      return true
    }
    return !remoteMessage.data["image"].isNullOrBlank()
  }

  override val title = remoteMessage.notification?.title
    ?: notificationData.title
    ?: parsedBodyJson()?.optString("title")?.takeIf { it.isNotBlank() }
    ?: remoteMessage.data["title"]?.takeIf { it.isNotBlank() }

  override val text = remoteMessage.notification?.body
    ?: notificationData.message
    ?: parsedBodyJson()?.optString("message")?.takeIf { it.isNotBlank() }
    ?: parsedBodyJson()?.optString("body")?.takeIf { it.isNotBlank() }
    ?: remoteMessage.data["body"]?.takeIf { it.isNotBlank() && !it.startsWith("{") }`;

function patchBuilder(projectRoot) {
  const filePath = path.join(projectRoot, BUILDER_REL_PATH);
  if (!fs.existsSync(filePath)) {
    throw new Error(`apply-expo-notification-patches: missing ${BUILDER_REL_PATH}`);
  }

  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes(BUILDER_V3_MARKER)) {
    return false;
  }

  if (src.includes(BUILDER_V2_MARKER)) {
    src = src.replace(BUILDER_V2_BLOCK, BUILDER_V3_BLOCK);
  } else if (src.includes(BUILDER_V1_MARKER)) {
    src = src.replace(BUILDER_V1_BLOCK, BUILDER_V3_BLOCK);
  } else if (src.includes(BUILDER_STOCK_LARGE_ICON_BLOCK)) {
    src = src.replace(
      BUILDER_STOCK_STYLE_LINE,
      '    // Notification style set below (BigText or BigPicture).',
    );
    src = src.replace(BUILDER_STOCK_LARGE_ICON_BLOCK, BUILDER_V3_BLOCK);
  } else {
    throw new Error('apply-expo-notification-patches: unexpected ExpoNotificationBuilder.kt');
  }

  fs.writeFileSync(filePath, src);
  return true;
}

function patchRemoteContent(projectRoot) {
  const filePath = path.join(projectRoot, REMOTE_CONTENT_REL_PATH);
  if (!fs.existsSync(filePath)) {
    throw new Error(`apply-expo-notification-patches: missing ${REMOTE_CONTENT_REL_PATH}`);
  }

  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes(REMOTE_V4_MARKER)) {
    return false;
  }

  if (src.includes(REMOTE_V2_MARKER)) {
    src = src.replace(REMOTE_V2_BLOCK, REMOTE_V4_BLOCK);
  } else if (src.includes('remoteMessage.data["image"]') && !src.includes('notification?.imageUrl')) {
    src = src.replace(REMOTE_V3_BLOCK, REMOTE_V4_BLOCK);
  } else if (src.includes('remoteMessage.data["image"]')) {
    src = src.replace(REMOTE_V1_GET_IMAGE, REMOTE_V4_BLOCK);
  } else if (src.includes(REMOTE_STOCK_GET_IMAGE)) {
    src = src.replace(REMOTE_STOCK_GET_IMAGE, REMOTE_V4_BLOCK);
  } else {
    throw new Error('apply-expo-notification-patches: unexpected RemoteNotificationContent.kt');
  }

  fs.writeFileSync(filePath, src);
  return true;
}

function patchExpoNotifications(projectRoot) {
  const builder = patchBuilder(projectRoot);
  const remote = patchRemoteContent(projectRoot);
  return builder || remote;
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
      ? 'Applied expo-notifications notification patches (v4).'
      : 'expo-notifications notification patches already up to date.',
  );
}

module.exports = withNotificationBigPicture;
module.exports.patchExpoNotifications = patchExpoNotifications;
