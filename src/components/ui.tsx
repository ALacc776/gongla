import { SymbolView, type SymbolViewProps, type SymbolWeight } from 'expo-symbols';
import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  DynamicColorIOS,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, type } from '@/lib/theme';

// The small set of shared iOS-style building blocks every screen uses.

export type IconName = SymbolViewProps['name'];

export function Icon({
  name,
  size = 20,
  color = colors.accent,
  weight = 'regular',
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  );
}

// A scenario character, shown like a contact photo.
export function Avatar({ emoji, size = 44 }: { emoji?: string | null; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {emoji ? (
        <Text style={{ fontSize: size * 0.55, lineHeight: size * 0.7 }}>{emoji}</Text>
      ) : (
        <Icon name="person.fill" size={size * 0.5} color={colors.secondary} />
      )}
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  // filled: the one main action. tinted: a secondary action. plain: text only.
  variant?: 'filled' | 'tinted' | 'plain';
  size?: 'large' | 'small';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  onPress,
  variant = 'filled',
  size = 'large',
  icon,
  disabled,
  loading,
  destructive,
  style,
}: ButtonProps) {
  const tint = destructive ? colors.destructive : colors.accent;
  const fg = variant === 'filled' ? colors.onAccent : tint;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        size === 'small' ? styles.buttonSmall : styles.buttonLarge,
        variant === 'filled' && { backgroundColor: tint },
        variant === 'tinted' && { backgroundColor: colors.fill },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={size === 'small' ? 15 : 18} color={fg} weight="semibold" />}
          <Text style={[size === 'small' ? styles.buttonTextSmall : styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// An inset grouped list section, as in Settings.
export function Group({
  header,
  footer,
  children,
  separatorInset = 16,
  prominent,
  style,
}: {
  header?: string;
  // A bold sentence-case header, for content screens (Practice) rather than settings.
  prominent?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  separatorInset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]}>
      {header && <Text style={prominent ? styles.groupHeaderProminent : styles.groupHeader}>{header}</Text>}
      <View style={styles.groupCard}>
        {items.map((child, i) => (
          <Fragment key={child.key ?? i}>
            {i > 0 && <View style={[styles.separator, { marginLeft: separatorInset }]} />}
            {child}
          </Fragment>
        ))}
      </View>
      {typeof footer === 'string' ? <Text style={styles.groupFooter}>{footer}</Text> : footer}
    </View>
  );
}

type RowProps = {
  title?: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  iconColor?: ColorValue;
  chevron?: boolean;
  checked?: boolean;
  // Blue text, for rows that are actions ("Test the voice").
  action?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  accessory?: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Row({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  chevron,
  checked,
  action,
  destructive,
  disabled,
  accessory,
  children,
  onPress,
  style,
}: RowProps) {
  const titleColor = destructive ? colors.destructive : action ? colors.accent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={checked !== undefined ? { selected: checked } : undefined}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.highlight },
        disabled && styles.disabled,
        style,
      ]}>
      {icon && <Icon name={icon} size={20} color={iconColor ?? (destructive ? colors.destructive : colors.accent)} />}
      {children ?? (
        <View style={styles.rowText}>
          <Text style={[type.body, { color: titleColor }]}>{title}</Text>
          {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
        </View>
      )}
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {accessory}
      {checked && <Icon name="checkmark" size={17} weight="semibold" />}
      {chevron && <Icon name="chevron.right" size={13} weight="semibold" color={colors.tertiary} />}
    </Pressable>
  );
}

// A small round icon button: speaker, ask, and the like. 44pt touch target.
export function IconButton({
  name,
  onPress,
  label,
  color = colors.accent,
  size = 20,
  disabled,
  style,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  color?: ColorValue;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, disabled && styles.disabled, style]}>
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

// A capsule that toggles on and off, for display options in the chat.
export function Toggle({
  label,
  icon,
  on,
  onPress,
}: {
  label: string;
  icon?: IconName;
  on: boolean;
  onPress: () => void;
}) {
  const fg = on ? colors.accent : colors.secondary;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [
        styles.toggle,
        { backgroundColor: on ? colors.accentSoft : colors.fill },
        pressed && styles.pressed,
      ]}>
      {icon && <Icon name={icon} size={15} color={fg} weight="medium" />}
      <Text style={[styles.toggleText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const thumbColor = Platform.OS === 'ios' ? DynamicColorIOS({ light: '#FFFFFF', dark: '#636366' }) : '#FFFFFF';

// A single-choice segmented control in the iOS style, with a sliding thumb.
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segment = width ? (width - 4) / options.length : 0;
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!segment) return;
    if (!placed.current) {
      x.setValue(index * segment);
      placed.current = true;
      return;
    }
    Animated.spring(x, { toValue: index * segment, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
  }, [index, segment, x]);

  return (
    <View
      style={[styles.segmented, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist">
      {segment > 0 && value !== undefined && (
        <Animated.View style={[styles.thumb, { width: segment, transform: [{ translateX: x }] }]} />
      )}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            style={styles.segment}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}>
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.35 },
  avatar: { backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },

  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999 },
  buttonLarge: { minHeight: 50, paddingHorizontal: 20 },
  buttonSmall: { minHeight: 34, paddingHorizontal: 14, alignSelf: 'flex-start' },
  buttonText: { fontSize: 17, fontWeight: '600' },
  buttonTextSmall: { fontSize: 15, fontWeight: '600' },

  group: { marginHorizontal: 16 },
  groupHeaderProminent: { ...type.title3, color: colors.text, paddingHorizontal: 4, paddingBottom: 10 },
  groupHeader: {
    ...type.footnote,
    color: colors.secondary,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingBottom: 7,
  },
  groupCard: { backgroundColor: colors.card, borderRadius: radius.card, borderCurve: 'continuous', overflow: 'hidden' },
  groupFooter: { ...type.footnote, color: colors.secondary, paddingHorizontal: 16, paddingTop: 7 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowText: { flex: 1, gap: 2 },
  rowSubtitle: { ...type.footnote, color: colors.secondary },
  rowValue: { ...type.body, color: colors.secondary },

  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  toggleText: { fontSize: 15, fontWeight: '500' },

  segmented: {
    flexDirection: 'row',
    height: 32,
    padding: 2,
    borderRadius: 9,
    borderCurve: 'continuous',
    backgroundColor: colors.fill,
  },
  thumb: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: 7,
    borderCurve: 'continuous',
    backgroundColor: thumbColor,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentText: { fontSize: 13, fontWeight: '500', color: colors.text },
  segmentTextOn: { fontWeight: '600' },
});
