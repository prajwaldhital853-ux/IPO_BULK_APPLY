const {
  withAndroidManifest,
  AndroidConfig,
  withDangerousMod,
} = require('expo/config-plugins');
const { generateImageAsync } = require('@expo/image-utils');
const fs = require('fs');
const path = require('path');

const ANDROID_RES_PATH = 'android/app/src/main/res/';
const LARGE_ICON = 'notification_large_icon';
const META_DATA = 'expo.modules.notifications.large_notification_icon';
const BASELINE_PIXEL_SIZE = 64;

const dpiValues = {
  mdpi: { folderName: 'drawable-mdpi', scale: 1 },
  hdpi: { folderName: 'drawable-hdpi', scale: 1.5 },
  xhdpi: { folderName: 'drawable-xhdpi', scale: 2 },
  xxhdpi: { folderName: 'drawable-xxhdpi', scale: 3 },
  xxxhdpi: { folderName: 'drawable-xxxhdpi', scale: 4 },
};

async function writeLargeIconFiles(projectRoot, icon) {
  await Promise.all(
    Object.values(dpiValues).map(async ({ folderName, scale }) => {
      const folderPath = path.resolve(projectRoot, ANDROID_RES_PATH, folderName);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      const sizePx = Math.round(BASELINE_PIXEL_SIZE * scale);
      const resized = (
        await generateImageAsync(
          { projectRoot, cacheType: 'android-notification-large' },
          {
            src: icon,
            width: sizePx,
            height: sizePx,
            resizeMode: 'contain',
            backgroundColor: 'transparent',
          },
        )
      ).source;
      fs.writeFileSync(path.resolve(folderPath, `${LARGE_ICON}.png`), resized);
    }),
  );
}

function withNotificationLargeIcon(config, props = {}) {
  const icon = props.icon;
  if (!icon) return config;

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      await writeLargeIconFiles(cfg.modRequest.projectRoot, icon);
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      META_DATA,
      `@drawable/${LARGE_ICON}`,
      'resource',
    );
    return cfg;
  });

  return config;
}

module.exports = withNotificationLargeIcon;
