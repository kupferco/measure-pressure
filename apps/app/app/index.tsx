import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Caption, Title } from '../src/components/ui';
import { capturePhotoInBrowser } from '../src/lib/capture';
import { colors, radius, spacing, type } from '../src/lib/theme';

/**
 * The camera. This is the app's front door, on purpose: the whole point is to
 * photograph a monitor and get on with your morning, so nothing stands between
 * opening the app and taking the shot.
 *
 * Everything else lives behind the small buttons around the edge.
 */
export default function CaptureScreen() {
  const router = useRouter();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);

  const goToConfirm = (uri: string) => router.push({ pathname: '/confirm', params: { uri } });

  const takePhoto = async () => {
    if (!camera.current || capturing) return;
    setCapturing(true);
    try {
      // JPEG rather than the iPhone default of HEIC, which Cloud Vision cannot read.
      // 0.7 keeps a seven-segment display perfectly legible at a fraction of the size,
      // which matters on a phone signal.
      const photo = await camera.current.takePictureAsync({ quality: 0.7, imageType: 'jpg' });
      if (photo?.uri) goToConfirm(photo.uri);
    } finally {
      setCapturing(false);
    }
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) goToConfirm(result.assets[0].uri);
  };

  const captureInBrowser = async () => {
    const uri = await capturePhotoInBrowser();
    if (uri) goToConfirm(uri);
  };

  /*
    On the web there is no in-app viewfinder: tapping the button hands off to the
    phone's own camera app. That is deliberately not a downgrade - it is the same
    camera at full resolution, and it avoids a live video preview fighting with
    Safari's chrome. The screen below is therefore a plain call to action rather
    than a camera feed.
  */
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.container, styles.permission]}>
        <View style={{ gap: spacing.sm }}>
          <Title>Take a reading</Title>
          <Body muted>
            Photograph the monitor display. Fill the frame with the numbers and keep the glass out
            of direct light.
          </Body>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Button label="Open camera" onPress={captureInBrowser} />
          <Button label="Type a reading instead" variant="secondary" onPress={() => router.push('/confirm')} />
          <Button label="See your readings" variant="ghost" onPress={() => router.push('/dashboard')} />
        </View>
        <Caption>
          Add this page to your home screen and it opens straight here, without the browser bar.
        </Caption>
      </SafeAreaView>
    );
  }

  // Permission is still being determined - show nothing rather than a flash of UI.
  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, styles.permission]}>
        <Title>Let the app use the camera</Title>
        <Body muted>
          It is only ever used for the photo you take of your monitor. Nothing is captured in the
          background.
        </Body>
        <Button label="Allow camera" onPress={requestPermission} />
        <Button
          label="Type a reading instead"
          variant="ghost"
          onPress={() => router.push('/confirm')}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Text style={styles.hint}>Fill the frame with the display</Text>
          <IconButton label="Charts" accessibilityLabel="Open your readings" onPress={() => router.push('/dashboard')} />
        </View>

        {/*
          A guide roughly the shape of an Omron readout. Framing the display well is
          the single biggest thing the user can do for OCR accuracy, so the app asks
          for it rather than silently coping with a bad shot.
        */}
        <View style={styles.guideWrapper} pointerEvents="none">
          <View style={styles.guide} />
        </View>

        <View style={styles.bottomBar}>
          <IconButton label="Photos" accessibilityLabel="Choose an existing photo" onPress={pickFromLibrary} />

          <Pressable
            onPress={takePhoto}
            disabled={capturing}
            accessibilityRole="button"
            accessibilityLabel="Take a photo of the monitor"
            style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            {capturing ? <ActivityIndicator color={colors.background} /> : <View style={styles.shutterInner} />}
          </Pressable>

          <IconButton label="Type" accessibilityLabel="Enter a reading by hand" onPress={() => router.push('/confirm')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function IconButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.iconLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permission: { flex: 1, padding: spacing.lg, gap: spacing.xl, justifyContent: 'center', backgroundColor: colors.background },
  overlay: { flex: 1, justifyContent: 'space-between' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  hint: {
    ...type.caption,
    color: '#fff',
    // A plain shadow keeps the hint readable over both a dark monitor and a bright wall.
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 6,
    flexShrink: 1,
  },

  guideWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  guide: {
    width: '100%',
    aspectRatio: 1.35,
    maxWidth: 420,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: radius.lg,
  },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  iconButton: {
    minWidth: 64,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  iconLabel: { ...type.caption, color: '#fff', fontWeight: '600' },
});
