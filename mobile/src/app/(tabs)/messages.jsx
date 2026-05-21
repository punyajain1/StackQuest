import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert, Image } from "react-native";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, Plus, UserPlus, Check, X, Swords } from "lucide-react-native";
import api from "@/utils/api";
import { useRouter } from "expo-router";

export default function Friends() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [friendUsername, setFriendUsername] = useState("");
  const [challengingId, setChallengingId] = useState(null);

  const handleChallengeFriend = async (friendId, friendName, friendElo) => {
    if (challengingId) return;
    setChallengingId(friendId);
    try {
      const res = await api.Duel.createDuel({ opponentId: friendId });
      const match = res.data || res;
      const matchId = match.match_id;
      if (!matchId) {
        throw new Error("Could not create duel match");
      }
      router.push({
        pathname: "/game/duel",
        params: {
          matchId,
          matchStatus: "invited",
          opponentUsername: friendName,
          opponentElo: String(friendElo),
        },
      });
    } catch (err) {
      Alert.alert("Challenge Failed", err.message || "Could not challenge friend.");
    } finally {
      setChallengingId(null);
    }
  };

  const handleSendRequest = async () => {
    if (!friendUsername.trim()) return;
    try {
      await api.Friends.sendRequest(friendUsername.trim());
      Alert.alert("Success", "Friend request sent!");
      setAddModalVisible(false);
      setFriendUsername("");
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to send request.");
    }
  };

  const handleAcceptRequest = async (friendshipId) => {
    try {
      await api.Friends.acceptRequest(friendshipId);
      Alert.alert("Success", "Friend request accepted!");
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to accept request.");
    }
  };

  const handleDeclineRequest = async (friendshipId) => {
    try {
      await api.Friends.rejectRequest(friendshipId);
      Alert.alert("Success", "Friend request declined!");
      queryClient.invalidateQueries({ queryKey: ['pendingRequests'] });
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to decline request.");
    }
  };

  const insets = useSafeAreaInsets();
  
  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api.Friends.getFriends().then(res => res.data || res || [])
  });

  const { data: pendingRequests = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['pendingRequests'],
    queryFn: () => api.Friends.getPendingRequests().then(res => res.data || res || [])
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

  const FriendItem = ({ id, name, status, online, time, elo }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#111",
      }}
    >
      <TouchableOpacity
        onPress={() => router.push(`/user/${id}`)}
        style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
      >
        <View style={{ position: "relative" }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#111",
              marginRight: 16,
              borderWidth: 1,
              borderColor: "#222",
              overflow: "hidden",
            }}
          >
            <Image
              source={{
                uri: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name || "default"}`,
              }}
              style={{
                width: "100%",
                height: "100%",
              }}
            />
          </View>
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
      </TouchableOpacity>
      <View style={{ alignItems: "flex-end", flexDirection: "row", alignItems: "center", gap: 10 }}>
        {online && (
          <TouchableOpacity
            onPress={() => handleChallengeFriend(id, name, elo)}
            disabled={challengingId !== null}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "rgba(255, 215, 0, 0.15)",
              borderWidth: 1,
              borderColor: "rgba(255, 215, 0, 0.4)",
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 12,
              gap: 6,
            }}
          >
            {challengingId === id ? (
              <ActivityIndicator size="small" color="#FFD700" />
            ) : (
              <>
                <Swords color="#FFD700" size={14} />
                <Text style={{ color: "#FFD700", fontWeight: "700", fontSize: 12 }}>Duel</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        <Text style={{ color: "#444", fontSize: 12 }}>{time}</Text>
      </View>
    </View>
  );

  const PendingRequestItem = ({ friendshipId, userId, name, status }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: "#0d0d0d",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#1e1e1e",
        marginBottom: 12,
      }}
    >
      <TouchableOpacity
        onPress={() => router.push(`/user/${userId}`)}
        style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#111",
            marginRight: 12,
            borderWidth: 1,
            borderColor: "#222",
            overflow: "hidden",
          }}
        >
          <Image
            source={{
              uri: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name || "default"}`,
            }}
            style={{
              width: "100%",
              height: "100%",
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
            {name}
          </Text>
          <Text style={{ color: "#888", fontSize: 12, marginTop: 1 }}>
            {status}
          </Text>
        </View>
      </TouchableOpacity>
      
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TouchableOpacity
          onPress={() => handleAcceptRequest(friendshipId)}
          style={{
            backgroundColor: "#22C55E20",
            borderWidth: 1,
            borderColor: "#22C55E60",
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check color="#22C55E" size={16} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDeclineRequest(friendshipId)}
          style={{
            backgroundColor: "#EF444420",
            borderWidth: 1,
            borderColor: "#EF444460",
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X color="#EF4444" size={16} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const onlineFriends = friends.filter(f => isOnline(f.last_active));
  const offlineFriends = friends.filter(f => !isOnline(f.last_active));
  const loading = friendsLoading || pendingLoading;

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
      ) : friends.length === 0 && pendingRequests.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: "#666" }}>No friends yet. Start adding some!</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        >
          {pendingRequests.length > 0 && (
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
                PENDING REQUESTS — {pendingRequests.length}
              </Text>
              {pendingRequests.map((f, i) => (
                <PendingRequestItem
                  key={i}
                  friendshipId={f.friendship_id}
                  userId={f.user_id}
                  name={f.username}
                  status={`Elo: ${f.elo} · ${f.league || 'Gold'}`}
                />
              ))}
            </>
          )}

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
                  id={f.user_id}
                  name={f.username}
                  status={`Elo: ${f.elo}`}
                  online={true}
                  time={formatTime(f.last_active)}
                  elo={f.elo}
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
                  id={f.user_id}
                  name={f.username}
                  status={`Elo: ${f.elo}`}
                  online={false}
                  time={formatTime(f.last_active)}
                  elo={f.elo}
                />
              ))}
            </>
          )}
          
          {friends.length === 0 && pendingRequests.length > 0 && (
            <View style={{ marginTop: 40, alignItems: "center" }}>
              <Text style={{ color: "#444", fontSize: 14 }}>No friends yet. Accept requests above or send some!</Text>
            </View>
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
