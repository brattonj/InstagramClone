/**
 * Login.js
 * 
 * Authentication screen component for user login. Provides a form with email and password inputs
 * and a sign-in button that authenticates users with Firebase. Also includes a link to navigate
 * to the registration screen for new users.
 */

import firebase from 'firebase';
import React, { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { container, form } from '../styles';

export default function Login(props) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const onSignUp = () => {
        firebase.auth().signInWithEmailAndPassword(email, password)
    }

    return (
        <View style={container.center}>
            <View style={container.formCenter}>
                <TextInput
                    style={form.textInput}
                    placeholder="email"
                    onChangeText={(email) => setEmail(email)}
                />
                <TextInput
                    style={form.textInput}
                    placeholder="password"
                    secureTextEntry={true}
                    onChangeText={(password) => setPassword(password)}
                />

                <Button
                    style={form.button}
                    onPress={() => onSignUp()}
                    title="Sign In"
                />
            </View>


            <View style={form.bottomButton} >
                <Text
                    title="Register"
                    onPress={() => props.navigation.navigate("Register")} >
                    Don't have an account? SignUp.
                </Text>
            </View>
        </View>
    )
}

