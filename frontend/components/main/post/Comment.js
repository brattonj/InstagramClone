import { AntDesign, FontAwesome5 } from '@expo/vector-icons';
import firebase from 'firebase';
import React, { useEffect, useState } from 'react';
import { FlatList, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { fetchUsersData, sendNotification } from '../../../redux/actions/index';
import { container, text, utils } from '../../styles';
import { timeDifference } from '../../utils';

require('firebase/firestore')


function Comment(props) {
    const [comments, setComments] = useState([])
    const [postId, setPostId] = useState("")
    const [input, setInput] = useState("")
    const [refresh, setRefresh] = useState(false)
    const [textInput, setTextInput] = useState(null)
    // Map of commentId -> { liked: bool, count: number }
    const [commentLikes, setCommentLikes] = useState({})
    // Modal state: show list of likers for a comment the current user authored
    const [likersModal, setLikersModal] = useState({ visible: false, likers: [], loading: false })

    useEffect(() => {
        getComments();
    }, [props.route.params.postId, props.users, refresh])

    const matchUserToComment = (comments) => {
        for (let i = 0; i < comments.length; i++) {
            if (comments[i].hasOwnProperty('user')) {
                continue;
            }

            const user = props.users.find(x => x.uid === comments[i].creator)
            if (user == undefined) {
                props.fetchUsersData(comments[i].creator, false)
            } else {
                comments[i].user = user
            }
        }
        setComments(comments)
        setRefresh(false)
    }

    const getComments = () => {
        if (props.route.params.postId !== postId || refresh) {
            firebase.firestore()
                .collection('posts')
                .doc(props.route.params.uid)
                .collection('userPosts')
                .doc(props.route.params.postId)
                .collection('comments')
                .orderBy('creation', 'desc')
                .get()
                .then((snapshot) => {
                    let comments = snapshot.docs.map(doc => {
                        const data = doc.data();
                        const id = doc.id;
                        return { id, ...data }
                    })
                    matchUserToComment(comments)
                    fetchCommentLikes(comments)
                })
            setPostId(props.route.params.postId)
        } else {
            matchUserToComment(comments)
        }
    }

    /**
     * For each comment, fetch:
     *  - whether the current user has liked it
     *  - the total like count (stored on the comment doc as likesCount)
     */
    const fetchCommentLikes = (commentList) => {
        const currentUid = firebase.auth().currentUser.uid
        const newLikes = {}

        commentList.forEach(comment => {
            // likesCount may already be on the comment document (maintained by Cloud Function)
            newLikes[comment.id] = {
                count: comment.likesCount || 0,
                liked: false,
            }

            // Check if current user has liked this comment
            firebase.firestore()
                .collection('posts')
                .doc(props.route.params.uid)
                .collection('userPosts')
                .doc(props.route.params.postId)
                .collection('comments')
                .doc(comment.id)
                .collection('likes')
                .doc(currentUid)
                .get()
                .then(snap => {
                    setCommentLikes(prev => ({
                        ...prev,
                        [comment.id]: {
                            count: prev[comment.id] ? prev[comment.id].count : (comment.likesCount || 0),
                            liked: snap.exists,
                        }
                    }))
                })
        })

        setCommentLikes(newLikes)
    }

    const onCommentLike = (comment) => {
        const currentUid = firebase.auth().currentUser.uid
        const likeRef = firebase.firestore()
            .collection('posts')
            .doc(props.route.params.uid)
            .collection('userPosts')
            .doc(props.route.params.postId)
            .collection('comments')
            .doc(comment.id)
            .collection('likes')
            .doc(currentUid)

        const alreadyLiked = commentLikes[comment.id] && commentLikes[comment.id].liked
        const currentCount = (commentLikes[comment.id] && commentLikes[comment.id].count) || 0

        if (alreadyLiked) {
            // Unlike
            setCommentLikes(prev => ({
                ...prev,
                [comment.id]: { liked: false, count: Math.max(0, currentCount - 1) }
            }))
            likeRef.delete()
        } else {
            // Like
            setCommentLikes(prev => ({
                ...prev,
                [comment.id]: { liked: true, count: currentCount + 1 }
            }))
            likeRef.set({
                creation: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                // Notify comment author if it's not the current user
                if (comment.creator !== currentUid) {
                    firebase.firestore()
                        .collection('users')
                        .doc(comment.creator)
                        .get()
                        .then(snap => {
                            if (snap.exists && snap.data().notificationToken) {
                                props.sendNotification(
                                    snap.data().notificationToken,
                                    'New Like',
                                    `${props.currentUser.name} liked your comment`,
                                    { type: 0, user: currentUid }
                                )
                            }
                        })
                }
            })
        }
    }

    /**
     * Show a modal with the usernames of everyone who liked a comment.
     * Only shown when the current user is the comment author.
     */
    const onShowLikers = (comment) => {
        setLikersModal({ visible: true, likers: [], loading: true })

        firebase.firestore()
            .collection('posts')
            .doc(props.route.params.uid)
            .collection('userPosts')
            .doc(props.route.params.postId)
            .collection('comments')
            .doc(comment.id)
            .collection('likes')
            .get()
            .then(snapshot => {
                const uids = snapshot.docs.map(doc => doc.id)
                if (uids.length === 0) {
                    setLikersModal({ visible: true, likers: [], loading: false })
                    return
                }

                // Fetch user data for each liker uid
                const userPromises = uids.map(uid =>
                    firebase.firestore().collection('users').doc(uid).get()
                )
                Promise.all(userPromises).then(userSnaps => {
                    const likers = userSnaps
                        .filter(s => s.exists)
                        .map(s => ({ uid: s.id, ...s.data() }))
                    setLikersModal({ visible: true, likers, loading: false })
                })
            })
    }

    const onCommentSend = () => {
        const textToSend = input;

        if (input.length == 0) {
            return;
        }
        setInput("")

        textInput.clear()
        firebase.firestore()
            .collection('posts')
            .doc(props.route.params.uid)
            .collection('userPosts')
            .doc(props.route.params.postId)
            .collection('comments')
            .add({
                creator: firebase.auth().currentUser.uid,
                text: textToSend,
                creation: firebase.firestore.FieldValue.serverTimestamp(),
                likesCount: 0,
            }).then(() => {
                setRefresh(true)
            })

        firebase.firestore()
            .collection("users")
            .doc(props.route.params.uid)
            .get()
            .then((snapshot) => {
                props.sendNotification(snapshot.data().notificationToken, "New Comment", `${props.currentUser.name} Commented on your post`, { type: 0, user: firebase.auth().currentUser.uid })
            })
    }

    const currentUid = firebase.auth().currentUser.uid

    return (
        <View style={[container.container, container.alignItemsCenter, utils.backgroundWhite]}>
            <FlatList
                numColumns={1}
                horizontal={false}
                data={comments}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <View style={utils.padding10}>
                        {item.user !== undefined ?
                            <View style={container.horizontal}>
                                {item.user.image == 'default' ?
                                    (
                                        <FontAwesome5
                                            style={[utils.profileImageSmall]}
                                            name="user-circle" size={35} color="black"
                                            onPress={() => props.navigation.navigate("Profile", { uid: item.user.uid, username: undefined })} />
                                    )
                                    :
                                    (
                                        <Image
                                            style={[utils.profileImageSmall]}
                                            source={{ uri: item.user.image }}
                                            onPress={() => props.navigation.navigate("Profile", { uid: item.user.uid, username: undefined })} />
                                    )
                                }
                                <View style={{ flex: 1, marginRight: 10 }}>
                                    <Text style={[utils.margin15Right, utils.margin5Bottom, { flexWrap: 'wrap' }]}>
                                        <Text style={[text.bold]}
                                            onPress={() => props.navigation.navigate("Profile", { uid: item.user.uid, username: undefined })}>
                                            {item.user.name}
                                        </Text>
                                        {" "}  {item.text}
                                    </Text>
                                    <View style={[container.horizontal, { alignItems: 'center' }]}>
                                        <Text style={[text.grey, text.small, utils.margin5Bottom]}>
                                            {timeDifference(new Date(), item.creation.toDate())}
                                        </Text>
                                        {/* Like count — tappable by comment author to see who liked */}
                                        {commentLikes[item.id] && commentLikes[item.id].count > 0 ? (
                                            <TouchableOpacity
                                                style={{ marginLeft: 12 }}
                                                onPress={() => {
                                                    if (item.creator === currentUid) {
                                                        onShowLikers(item)
                                                    }
                                                }}
                                            >
                                                <Text style={[text.grey, text.small, utils.margin5Bottom]}>
                                                    {commentLikes[item.id].count}{' '}
                                                    {commentLikes[item.id].count === 1 ? 'like' : 'likes'}
                                                    {item.creator === currentUid ? ' ›' : ''}
                                                </Text>
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                </View>

                                {/* Like / Unlike button */}
                                <TouchableOpacity
                                    style={{ justifyContent: 'center', paddingHorizontal: 8 }}
                                    onPress={() => onCommentLike(item)}
                                >
                                    <AntDesign
                                        name={commentLikes[item.id] && commentLikes[item.id].liked ? 'heart' : 'hearto'}
                                        size={16}
                                        color={commentLikes[item.id] && commentLikes[item.id].liked ? 'red' : 'grey'}
                                    />
                                </TouchableOpacity>
                            </View>
                            : null}
                    </View>
                )}
            />

            {/* Bottom comment input */}
            <View style={[utils.borderTopGray]}>
                <View style={[container.horizontal, utils.padding10, utils.alignItemsCenter, utils.backgroundWhite]}>
                    {
                        props.currentUser.image == 'default' ?
                            (
                                <FontAwesome5
                                    style={[utils.profileImageSmall]}
                                    name="user-circle" size={35} color="black" />
                            )
                            :
                            (
                                <Image
                                    style={[utils.profileImageSmall]}
                                    source={{ uri: props.currentUser.image }}
                                />
                            )
                    }
                    <View style={[container.horizontal, utils.justifyCenter, utils.alignItemsCenter]}>
                        <TextInput
                            ref={input => { setTextInput(input) }}
                            value={input}
                            multiline={true}
                            style={[container.fillHorizontal, container.input, container.container]}
                            placeholder='comment...'
                            onChangeText={(input) => setInput(input)} />

                        <TouchableOpacity
                            onPress={() => onCommentSend()}
                            style={{ width: 100, alignSelf: 'center' }}>
                            <Text style={[text.bold, text.medium, text.deepskyblue]}>Post</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Modal: list of users who liked a comment (shown to comment author) */}
            <Modal
                visible={likersModal.visible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setLikersModal({ visible: false, likers: [], loading: false })}
            >
                <View style={{
                    flex: 1,
                    justifyContent: 'flex-end',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                }}>
                    <View style={{
                        backgroundColor: 'white',
                        borderTopLeftRadius: 16,
                        borderTopRightRadius: 16,
                        maxHeight: '60%',
                        padding: 16,
                    }}>
                        <View style={[container.horizontal, { justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }]}>
                            <Text style={[text.bold, { fontSize: 16 }]}>Liked by</Text>
                            <TouchableOpacity onPress={() => setLikersModal({ visible: false, likers: [], loading: false })}>
                                <Text style={[text.deepskyblue, { fontSize: 15 }]}>Close</Text>
                            </TouchableOpacity>
                        </View>

                        {likersModal.loading ? (
                            <Text style={[text.grey, { textAlign: 'center', padding: 20 }]}>Loading…</Text>
                        ) : likersModal.likers.length === 0 ? (
                            <Text style={[text.grey, { textAlign: 'center', padding: 20 }]}>No likes yet</Text>
                        ) : (
                            <ScrollView>
                                {likersModal.likers.map(liker => (
                                    <TouchableOpacity
                                        key={liker.uid}
                                        style={[container.horizontal, { alignItems: 'center', paddingVertical: 8 }]}
                                        onPress={() => {
                                            setLikersModal({ visible: false, likers: [], loading: false })
                                            props.navigation.navigate("Profile", { uid: liker.uid, username: undefined })
                                        }}
                                    >
                                        {liker.image == 'default' ? (
                                            <FontAwesome5
                                                style={[utils.profileImageSmall]}
                                                name="user-circle" size={35} color="black" />
                                        ) : (
                                            <Image
                                                style={[utils.profileImageSmall]}
                                                source={{ uri: liker.image }} />
                                        )}
                                        <View>
                                            <Text style={[text.bold]}>{liker.name}</Text>
                                            <Text style={[text.grey, text.small]}>@{liker.username}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    )
}


const mapStateToProps = (store) => ({
    users: store.usersState.users,
    currentUser: store.userState.currentUser
})
const mapDispatchProps = (dispatch) => bindActionCreators({ fetchUsersData, sendNotification }, dispatch);

export default connect(mapStateToProps, mapDispatchProps)(Comment);
