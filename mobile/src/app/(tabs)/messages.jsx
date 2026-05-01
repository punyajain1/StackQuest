import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, Plus, MoreVertical } from "lucide-react-native";

export default function Friends() {
  const insets = useSafeAreaInsets();

  const FriendItem = ({ name, status, online, time }) => (
    <TouchableOpacity
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
            style={{
              backgroundColor: "#111",
              padding: 10,
              borderRadius: 12,
              marginRight: 8,
            }}
          >
            <Search color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: "#fff", padding: 10, borderRadius: 12 }}
          >
            <Plus color="#000" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
      >
        <Text
          style={{
            color: "#666",
            fontSize: 14,
            fontWeight: "700",
            marginBottom: 16,
            marginTop: 16,
          }}
        >
          ONLINE — 4
        </Text>
        <FriendItem
          name="Sarah_Dev"
          status="Solving React hooks..."
          online={true}
          time="now"
        />
        <FriendItem
          name="CodeWiz"
          status="Active in Duel"
          online={true}
          time="5m"
        />
        <FriendItem
          name="PyGuru"
          status="Thinking..."
          online={true}
          time="12m"
        />
        <FriendItem
          name="BackendBoss"
          status="Writing tests"
          online={true}
          time="now"
        />

        <Text
          style={{
            color: "#666",
            fontSize: 14,
            fontWeight: "700",
            marginBottom: 16,
            marginTop: 32,
          }}
        >
          OFFLINE — 12
        </Text>
        <FriendItem
          name="OldSchoolCoder"
          status="Last seen 2h ago"
          online={false}
          time="2h"
        />
        <FriendItem
          name="Rustafarian"
          status="Last seen yesterday"
          online={false}
          time="1d"
        />
      </ScrollView>
    </View>
  );
}
