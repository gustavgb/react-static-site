import React from 'react'
import styled from 'styled-components'

const Main = styled.div`
  background-color: blue;
  border-radius: 5px;
`

class App extends React.Component {
  render () {
    return (
      <Main>
        <p>Homepage</p>
        <a href='/about'>About</a>
        <a href='/contact'>Contact</a>
      </Main>
    )
  }
}

export default <App />
