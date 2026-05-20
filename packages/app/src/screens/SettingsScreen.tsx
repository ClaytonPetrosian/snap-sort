/**
 * Settings Screen — app configuration and API key management.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';

export function SettingsScreen({ navigation }: any) {
  const [apiKey, setApiKey] = useState('');
  const [lowPowerMode, setLowPowerMode] = useState(true);
  const [kValue, setKValue] = useState('5');
  const [cloudAIEnabled, setCloudAIEnabled] = useState(false);

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      Alert.alert('提示', '请输入 API Key');
      return;
    }
    // TODO: SecureStore save
    setCloudAIEnabled(true);
    Alert.alert('成功', 'API Key 已保存，云端 AI 已启用');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI 模型设置</Text>

        <View style={styles.row}>
          <Text style={styles.label}>KNN 邻居数 (K)</Text>
          <TextInput
            style={styles.input}
            value={kValue}
            onChangeText={setKValue}
            keyboardType="numeric"
            placeholderTextColor="#666"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>性能控制</Text>

        <View style={styles.row}>
          <Text style={styles.label}>低电量自动暂停</Text>
          <Switch
            value={lowPowerMode}
            onValueChange={setLowPowerMode}
            trackColor={{ false: '#333', true: '#3b82f6' }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>云端 AI 扩展</Text>
        <Text style={styles.description}>
          输入 Gemini API Key 以启用云端图片识别功能（可选，离线优先）
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>启用云端 AI</Text>
          <Switch
            value={cloudAIEnabled}
            onValueChange={(v) => {
              if (v && !apiKey.trim()) {
                Alert.alert('提示', '请先输入 Gemini API Key');
                return;
              }
              setCloudAIEnabled(v);
            }}
            trackColor={{ false: '#333', true: '#10b981' }}
          />
        </View>

        <TextInput
          style={styles.apiInput}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="AIza..."
          placeholderTextColor="#444"
          secureTextEntry
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveApiKey}>
          <Text style={styles.saveButtonText}>保存 API Key</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>关于</Text>
        <Text style={styles.about}>SnapSort v0.1.0</Text>
        <Text style={styles.aboutSub}>本地优先 · 隐私安全 · AI 驱动</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  description: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    color: '#ccc',
    fontSize: 16,
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 60,
    textAlign: 'center',
    fontSize: 16,
  },
  apiInput: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  about: {
    color: '#888',
    fontSize: 14,
  },
  aboutSub: {
    color: '#555',
    fontSize: 12,
    marginTop: 4,
  },
});
