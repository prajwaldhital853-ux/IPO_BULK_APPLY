import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { ThemeColors } from '../../theme/colors';
import { rs } from '../../utils/responsive';

type Props = {
  colors: ThemeColors;
  imageUri: string | null;
  picking: boolean;
  onImageSelected: (uri: string, mimeType: string) => void;
  onImageClear: () => void;
  onPickingChange: (picking: boolean) => void;
};

const isWeb = Platform.OS === 'web';

function readWebFile(file: File): { uri: string; mime: string } | null {
  if (!file.type.startsWith('image/')) return null;
  return {
    uri: URL.createObjectURL(file),
    mime: file.type || 'image/jpeg',
  };
}

export function ImageDropZone({
  colors,
  imageUri,
  picking,
  onImageSelected,
  onImageClear,
  onPickingChange,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const styles = useMemo(() => makeStyles(colors, dragOver), [colors, dragOver]);

  const pickFromGallery = useCallback(async () => {
    try {
      onPickingChange(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo access so you can attach an image to the notification.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      onImageSelected(asset.uri, asset.mimeType ?? 'image/jpeg');
    } catch (e) {
      Alert.alert('Image failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      onPickingChange(false);
    }
  }, [onImageSelected, onPickingChange]);

  const acceptWebFiles = useCallback(
    (files: FileList | File[] | null | undefined) => {
      const file = files?.[0];
      if (!file) return;
      const parsed = readWebFile(file);
      if (!parsed) {
        Alert.alert('Invalid file', 'Please use an image file (JPEG, PNG, WebP, etc.).');
        return;
      }
      onImageSelected(parsed.uri, parsed.mime);
    },
    [onImageSelected],
  );

  const webDragProps = isWeb
    ? ({
        onDragEnter: (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        },
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        },
        onDragLeave: (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          acceptWebFiles(e.dataTransfer?.files);
        },
      } as Record<string, unknown>)
    : {};

  if (imageUri) {
    return (
      <View style={styles.previewWrap}>
        <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
        <Pressable style={styles.removeBtn} onPress={onImageClear}>
          <Ionicons name="close-circle" size={rs(22)} color="#fff" />
        </Pressable>
        <Pressable style={styles.replaceBtn} onPress={() => void pickFromGallery()}>
          <Ionicons name="images-outline" size={rs(14)} color="#fff" />
          <Text style={styles.replaceBtnText}>Replace</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.dropZone}
      onPress={() => void pickFromGallery()}
      disabled={picking}
      accessibilityRole="button"
      accessibilityLabel="Add notification image"
      {...webDragProps}
    >
      {picking ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Ionicons
            name={dragOver ? 'download-outline' : 'cloud-upload-outline'}
            size={rs(26)}
            color={dragOver ? colors.primary : colors.textSecondary}
          />
          <Text style={[styles.dropTitle, dragOver && styles.dropTitleActive]}>
            {dragOver
              ? 'Drop image here'
              : isWeb
                ? 'Drag & drop image here'
                : 'Tap to add image'}
          </Text>
          <Text style={styles.dropHint}>
            {isWeb ? 'or click to browse from gallery' : 'Choose from your photo gallery'}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function makeStyles(c: ThemeColors, dragOver: boolean) {
  const active = dragOver;
  return StyleSheet.create({
    dropZone: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: rs(6),
      minHeight: rs(132),
      borderWidth: 2,
      borderColor: active ? c.primary : c.borderMuted,
      borderStyle: 'dashed',
      backgroundColor: active ? `${c.primary}14` : c.surface,
      borderRadius: rs(12),
      paddingHorizontal: rs(16),
      paddingVertical: rs(18),
      ...(isWeb ? ({ cursor: 'pointer' } as ViewStyle) : null),
    },
    dropTitle: {
      color: c.text,
      fontWeight: '800',
      fontSize: rs(13),
      textAlign: 'center',
    },
    dropTitleActive: {
      color: c.primary,
    },
    dropHint: {
      color: c.textMuted,
      fontSize: rs(11),
      textAlign: 'center',
      lineHeight: rs(16),
    },
    previewWrap: {
      position: 'relative',
      borderRadius: rs(12),
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.borderMuted,
    },
    preview: {
      width: '100%',
      height: rs(160),
      backgroundColor: c.surface,
    },
    removeBtn: {
      position: 'absolute',
      top: rs(8),
      right: rs(8),
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: rs(12),
      padding: rs(2),
    },
    replaceBtn: {
      position: 'absolute',
      bottom: rs(8),
      right: rs(8),
      flexDirection: 'row',
      alignItems: 'center',
      gap: rs(4),
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: rs(8),
      paddingHorizontal: rs(8),
      paddingVertical: rs(5),
    },
    replaceBtnText: {
      color: '#fff',
      fontSize: rs(11),
      fontWeight: '700',
    },
  });
}
