import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from "react-native";
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, Plus, UserPlus } from "lucide-react-native";
import api from "@/utils/api";
import { useRouter } from "expo-router";

export default function Friends() {
  const router = useRouter();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [friendUsername, setFriendUsername] = useState("");

  const handleSendRequest = async () => {
    if (!friendUsername.trim()) return;
    try {
      await api.Friends.sendRequest(friendUsername.trim());
      Alert.alert("Success", "Friend request sent!");
      setAddModalVisible(false);
      setFriendUsername("");
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to send request.");
    }
  };
  const insets = useSafeAreaInsets();
  
  const { data: friends = [], isLoading: loading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api.Friends.getFriends().then(res => res.data || res || [])
  });

  const isOnline = (lastActive) => {
    if (!lastActive) return false;
    const diff = new Date() - new Date(lastActive);
    return diff < 1000 * 60 * 15; // 15 mins
  };

  const formatTime = (lastActive) => {
    if (!lastActive) return "unknown";
    const diff = new Date() - new Date(lastActive);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const FriendItem = ({ id, name, status, online, time }) => (
    <TouchableOpacity
      onPress={() => router.push(`/user/${id}`)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#111",
      }}
    >
      <View style={{ position: "relative" }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#222",
            marginRight: 16,
          }}
        />
        {online && (
          <View
            style={{
              position: "absolute",
              bottom: 2,
              right: 18,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: "#00FF00",
              borderWidth: 2,
              borderColor: "#000",
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
          {name}
        </Text>
        <Text style={{ color: "#666", fontSize: 14, marginTop: 2 }}>
          {status}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: "#444", fontSize: 12 }}>{time}</Text>
      </View>
    </TouchableOpacity>
  );

  const onlineFriends = friends.filter(f => isOnline(f.last_active));
  const offlineFriends = friends.filter(f => !isOnline(f.last_active));

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 16,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 28, fontWeight: "800" }}>
          Friends
        </Text>
        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity
            onPress={() => setAddModalVisible(true)}
            style={{
              backgroundColor: "#111",
              padding: 10,
              borderRadius: 12,
              marginRight: 8,
            }}
          >
            <UserPlus color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: "#fff", padding: 10, borderRadius: 12 }}
          >
            <Plus color="#000" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color="#FFD700" />
        </View>
      ) : friends.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: "#666" }}>No friends yet. Start adding some!</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        >
          {onlineFriends.length > 0 && (
            <>
              <Text
                style={{
                  color: "#666",
                  fontSize: 14,
                  fontWeight: "700",
                  marginBottom: 16,
                  marginTop: 16,
                }}
              >
                ONLINE — {onlineFriends.length}
              </Text>
              {onlineFriends.map((f, i) => (
                <FriendItem
                  key={i}
                  id={f.id}
                  name={f.username}
                  status={`Elo: ${f.elo}`}
                  online={true}
                  time={formatTime(f.last_active)}
                />
              ))}
            </>
          )}

          {offlineFriends.length > 0 && (
            <>
              <Text
                style={{
                  color: "#666",
                  fontSize: 14,
                  fontWeight: "700",
                  marginBottom: 16,
                  marginTop: 32,
                }}
              >
                OFFLINE — {offlineFriends.length}
              </Text>
              {offlineFriends.map((f, i) => (
                <FriendItem
                  key={i}
                  id={f.id}
                  name={f.username}
                  status={`Elo: ${f.elo}`}
                  online={false}
                  time={formatTime(f.last_active)}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Add Friend Modal */}
      <Modal visible={addModalVisible} animationType="slide" transparent={true}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: "#111", padding: 24, borderRadius: 24, borderWidth: 1, borderColor: "#333" }}>
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 16 }}>Add Friend</Text>
            
            <TextInput
              style={{ backgroundColor: "#000", color: "#fff", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#333", marginBottom: 20 }}
              placeholder="Enter username"
              placeholderTextColor="#666"
              value={friendUsername}
              onChangeText={setFriendUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <TouchableOpacity
                onPress={() => setAddModalVisible(false)}
                style={{ flex: 1, padding: 16, backgroundColor: "#222", borderRadius: 12, marginRight: 8, alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={handleSendRequest}
                style={{ flex: 1, padding: 16, backgroundColor: "#007AFF", borderRadius: 12, marginLeft: 8, alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Send Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
