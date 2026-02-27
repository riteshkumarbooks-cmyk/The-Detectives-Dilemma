import { Image, StyleSheet, Dimensions } from 'react-native';
import { Colors } from '@/constants/colors';

const { width, height } = Dimensions.get('window');

export default function IndexPage() {
  return (
    <Image
      source={require('../assets/splash.png')}
      style={styles.image}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width,
    height,
    backgroundColor: Colors.background,
  },
});
